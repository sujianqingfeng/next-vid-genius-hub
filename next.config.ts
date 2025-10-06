import type { NextConfig } from 'next'


const nextConfig: NextConfig = {
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
