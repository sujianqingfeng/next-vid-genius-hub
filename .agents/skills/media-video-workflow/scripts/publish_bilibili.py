#!/usr/bin/env python3
"""Publish (or delete) a video on Bilibili via the web API (bilibili-api).

Optional capability of the media-video-workflow skill. Requires Python and
`pip install bilibili-api-python`. Cookies: read from --cookie-file (default
.bili.env, KEY=VALUE). If incomplete, auto-extracted from a logged-in Dia
session via the Kimi WebBridge daemon (CDP Network.getCookies, 127.0.0.1:10086).

Usage:
  python publish_bilibili.py --video x.mp4 --title "..." [--tid 21] \
      [--tag "a,b"] [--desc "..."] [--cover y.jpg] [--dry-run]
  python publish_bilibili.py --delete-aid <aid>   # NOTE: hits 340022, see below
"""
import argparse, asyncio, os, subprocess, sys, urllib.request, json, urllib.parse

DEFAULT_COOKIE_FILE = ".bili.env"
WEBBRIDGE = "http://127.0.0.1:10086/command"
NEEDED = ["SESSDATA", "bili_jct", "DedeUserID", "buvid3"]


def read_cookie_file(path):
    env = {}
    try:
        for line in open(path):
            if "=" in line:
                k, v = line.strip().split("=", 1)
                env[k] = v
    except FileNotFoundError:
        return {}
    return env


def cookies_from_webbridge():
    body = json.dumps({
        "action": "cdp", "args": {"method": "Network.getCookies",
        "params": {"urls": ["https://www.bilibili.com", "https://api.bilibili.com"]}},
        "session": "bili-publish",
    }).encode()
    try:
        req = urllib.request.Request(WEBBRIDGE, data=body, headers={"Content-Type": "application/json"})
        return {c["name"]: c["value"] for c in (json.load(urllib.request.urlopen(req, timeout=20)).get("data", {}).get("cookies") or [])}
    except Exception:
        return {}


def get_cookies(cookie_file):
    env = read_cookie_file(cookie_file)
    if all(k in env for k in NEEDED):
        return env
    print("[bili] cookie file incomplete; trying Kimi WebBridge (Dia session)…", file=sys.stderr)
    wb = cookies_from_webbridge()
    for k in NEEDED:
        env.setdefault(k, wb.get(k, ""))
    if all(env.get(k) for k in NEEDED):
        with open(cookie_file, "w") as f:
            for k, v in env.items():
                if v:
                    f.write(f"{k}={v}\n")
        os.chmod(cookie_file, 0o600)
    return env


def ensure_cover(video, cover):
    if cover and os.path.exists(cover):
        return cover
    cover = cover or ".cover.jpg"
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-ss", "8", "-i", video, "-frames:v", "1", cover], check=True)
    return cover


def publish(video, title, tid, tag, desc, cover, cookie_file, dry_run):
    from bilibili_api import video_uploader, Credential
    env = get_cookies(cookie_file)
    missing = [k for k in NEEDED if not env.get(k)]
    if missing:
        raise SystemExit(f"Missing cookies {missing}; log into Bilibili in Dia (WebBridge) or populate {cookie_file}.")
    if dry_run:
        print(f"[dry-run] would publish {video!r} title={title!r} tid={tid} tag={tag!r} cover={cover!r}")
        return
    cred = Credential(sessdata=env["SESSDATA"], bili_jct=env["bili_jct"],
                      buvid3=env.get("buvid3", ""), dedeuserid=env["DedeUserID"])
    page = video_uploader.VideoUploaderPage(path=video, title=title, description=desc)
    meta = video_uploader.VideoMeta(tid=tid, title=title, desc=desc, cover=cover, tags=tag, original=True)
    res = asyncio.run(video_uploader.VideoUploader(pages=[page], meta=meta, credential=cred).start())
    print("PUBLISHED:", res)


def delete_archive(aid, cookie_file):
    """Delete an archive. Endpoint POST /x/web/archive/delete captured from the
    creator center. B站 gates deletion behind a verification token, so {aid,csrf}
    returns 340022 '验证码错误' — headless API delete does NOT work; delete by hand."""
    env = get_cookies(cookie_file)
    cookie = f"SESSDATA={env['SESSDATA']}; bili_jct={env['bili_jct']}; DedeUserID={env['DedeUserID']}"
    body = urllib.parse.urlencode({"aid": aid, "csrf": env["bili_jct"]}).encode()
    req = urllib.request.Request("https://member.bilibili.com/x/web/archive/delete", data=body,
        headers={"Cookie": cookie, "User-Agent": "Mozilla/5.0", "Referer": "https://member.bilibili.com/",
                 "Content-Type": "application/x-www-form-urlencoded"})
    return json.load(urllib.request.urlopen(req, timeout=20))


def main():
    ap = argparse.ArgumentParser(description="Publish a video to Bilibili via web API.")
    ap.add_argument("--video")
    ap.add_argument("--title")
    ap.add_argument("--tid", type=int, default=21, help="分区 id (default 21)")
    ap.add_argument("--tag", default="", help="逗号分隔的标签")
    ap.add_argument("--desc", default="")
    ap.add_argument("--cover", default=None, help="封面图；不传则自动抽帧")
    ap.add_argument("--cookie-file", default=DEFAULT_COOKIE_FILE)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delete-aid", metavar="AID", help="（实验）删除稿件——会撞 340022 风控，基本不可用")
    a = ap.parse_args()
    if a.delete_aid:
        print("DELETE:", delete_archive(a.delete_aid, a.cookie_file))
        return
    if not (a.video and a.title):
        ap.error("--video and --title are required (unless using --delete-aid)")
    cover = ensure_cover(a.video, a.cover) if not a.dry_run else a.cover
    publish(a.video, a.title, a.tid, a.tag, a.desc, cover, a.cookie_file, a.dry_run)


if __name__ == "__main__":
    main()
