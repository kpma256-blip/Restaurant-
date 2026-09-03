import "dotenv/config";
import { createApp } from "./app";
import { startToastScheduler } from "./integrations/toast/scheduler";
import { cleanupStaleDrafts } from "./lib/fileStorage";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Restaurant inventory API listening on http://localhost:${port}`);
  startToastScheduler();
  cleanupStaleDrafts();
});
