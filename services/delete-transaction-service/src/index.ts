import { app } from './app';
import { EventStoreRecorder } from './services/event-store-recorder.service';

const port = process.env.PORT || 3000;
const recorder = EventStoreRecorder.getInstance();

(async () => {
  await recorder.connect();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
})();
