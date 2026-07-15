import { createApp } from "./app";

// API_PORT 优先于 PORT：dev 下前端工具链会注入自己的 PORT，后端不能跟着跑偏。
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
