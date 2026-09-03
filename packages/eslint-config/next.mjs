import nextVitals from 'eslint-config-next/core-web-vitals';

import baseConfig from './base.mjs';

const config = [...baseConfig, ...nextVitals];

export default config;
