// app/weekly.html(본문)을 감싸서 GitHub Pages 등에 올릴 수 있는 index.html을 만듭니다.
import { readFileSync, writeFileSync } from "node:fs";
const body = readFileSync(new URL("../app/weekly.html", import.meta.url), "utf8");
const head = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1f4e79">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="주간학습">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
</head>
<body>
<!-- 이 파일은 scripts/build.mjs가 app/weekly.html로 만듭니다. 고칠 때는 app/weekly.html을 고치고 npm run build 하세요. -->
`;
const tail = `
<script>
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
</script>
</body>
</html>
`;
writeFileSync(new URL("../index.html", import.meta.url), head + body + tail);
console.log("index.html 생성 완료");
