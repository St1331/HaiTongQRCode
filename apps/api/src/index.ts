import express from 'express';

import { APP_NAME } from '@haitong/shared';

export const apiBootstrap = {
  appName: APP_NAME,
  framework: express,
} as const;
