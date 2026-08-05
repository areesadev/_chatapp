import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // O app Express antigo vive em legacy/ apenas como referência histórica.
  outputFileTracingExcludes: {
    '*': ['./legacy/**/*'],
  },
};

export default nextConfig;
