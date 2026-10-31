import express from 'express';
import authRouter from './routes/auth';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/', authRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
