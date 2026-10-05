/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    AWS_IOT_ENDPOINT: process.env.AWS_IOT_ENDPOINT,
    AWS_REGION: process.env.AWS_REGION,
  },
};
module.exports = nextConfig;
