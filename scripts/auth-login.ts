import { runLoginFlow } from '../src/cli/login.js';

const targetPath = process.argv[2] || process.env.DATA_STUDIO_AUTH_FILE;

runLoginFlow(targetPath)
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error during login:', err);
    process.exit(1);
  });
