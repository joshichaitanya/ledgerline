import { app } from './app';
import { EventStoreRecorder } from './services/event-store-recorder.service';

const port = process.env.PORT || 3000;
const transactionRecorder = EventStoreRecorder.getInstance();

(async () => {
  await transactionRecorder.connect();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
})();
