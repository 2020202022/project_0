const express = require("express");
const path = require("path");

const app = express();
const PORT = 8080;

// public 폴더를 정적 파일 제공 경로로 설정
app.use(express.static(path.join(__dirname, "public")));

// 루트 경로("/")로 접속 시 login.html 파일을 전송
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});