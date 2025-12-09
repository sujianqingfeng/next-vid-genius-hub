import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
// Initialize Cloudflare bindings for Next dev as early as possible
// Use the D1 binding defined in wrangler.json and the "local" env
initOpenNextCloudflareForDev({ environment: 'local', configPath: './wrangler.json' })


const nextConfig: NextConfig = {
    experimental: {
        optimizePackageImports: ['lucide-react'],
    },
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'i.ytimg.com',
				port: '',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'yt3.ggpht.com',
				port: '',
				pathname: '/**',
			},
			// TikTok / Douyin thumbnails
			{
				protocol: 'https',
				hostname: '**.tiktokcdn-us.com',
				port: '',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '**.tiktokcdn.com',
				port: '',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '**.douyinpic.com',
				port: '',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '**.douyin.com',
				port: '',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '**.pstatp.com',
				port: '',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '**.byteimg.com',
				port: '',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '**.douyinstatic.com',
				port: '',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '**.muscdn.com',
				port: '',
				pathname: '/**',
			},
		],
	},
	serverExternalPackages: [
		'@remotion/bundler',
		'@remotion/renderer',
		'remotion',
	],
}

export default nextConfig
