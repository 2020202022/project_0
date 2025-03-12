const express = require("express"); // express 모듈 불러오기
const path = require("path");   // 파일 경로 관련 기능 제공
const session = require("express-session"); // 세션 관리 모듈
const passport = require("passport");   // 로그인 인증을 위한 passport 모듈
const KakaoStrategy = require("passport-kakao").Strategy;   // 카카오
const GoogleStrategy = require("passport-google-oauth20").Strategy; // 구글
const axios = require("axios"); // http 요청을 보내기 위한 axios 모듈
const fs = require("fs");  // fs 모듈 추가
require('dotenv').config(); // .env 파일에 있는 환경 변수 불러오기

// .env에서 google oauth 정보 가져오기
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const app = express();  // express 애플리케이션 생성 (서버)
const PORT = 8080;  // 서버가 실행될 포트 넘버

// ----- [1] 세션 설정 -----
app.use(
    session({
        secret: "choijh",   // 세션 암호화 키
        resave: false,      // 세션을 변경하지 않으면 저장x
        saveUninitialized: false,   // 빈 세션을 저장할지 여부
    })
);

// ----- [2] Passport 초기화 -----
app.use(passport.initialize()); // passport 초기화 미들웨어 적용
app.use(passport.session());    // passport가 세션을 사용할 수 있도록 설정

// ----- [3] Passport 전략 설정 -----

// (a) 카카오 로그인 전략 설정
passport.use(
    new KakaoStrategy(
        {
            clientID: "0839de029820e644fa50a0c2492a6ec0", // 카카오 디벨로퍼스에서 발급받은 REST API 키
            callbackURL: "/auth/kakao/callback", // 카카오 인증 후 돌아올 주소
        },
        async (accessToken, refreshToken, profile, done) => {
            // profile: 카카오에서 보내주는 사용자 정보
            try {
                // 실제 서비스에서는 DB 조회 또는 회원가입 로직을 넣어야 함
                // 여기서는 간단히 profile 정보만 넘겨서 세션에 저장한다고 가정
                const user = {
                    id: profile.id,
                    accessToken: accessToken,   // 로그아웃 시 사용
                };
                return done(null, user);    // passport에 사용자 정보 넘기기
            } catch (err) {
                return done(err);   // 오류 발생 시
            }
        }
    )
);

// (b) 구글 로그인 전략 설정
passport.use(
    new GoogleStrategy(
        {
            clientID: GOOGLE_CLIENT_ID, // Google에서 발급한 클라이언트 ID
            clientSecret: GOOGLE_CLIENT_SECRET, // Google에서 발급한 클라이언트 비밀번호
            callbackURL: "/auth/google/callback",   // 구글 인증 후 돌아올 콜백 URL
        },
        (accessToken, refreshToken, profile, done) => {
            // 유저 정보 생성
            const user = {
                id: profile.id,
                displayName: profile.displayName,   // 구글 프로필 이름
            };
            return done(null, user);    // passport에 사용자 정보 넘기기
        }
    )
);

// ----- [4] 세션 직렬화/역직렬화 -----
passport.serializeUser((user, done) => {
    // Strategy에서 넘긴 user 객체가 세션에 저장됨
    done(null, user);
});
passport.deserializeUser((obj, done) => {
    // 세션에 저장된 user를 req.user로 복원
    done(null, obj);
});

// ----- [5] 정적 파일 경로 설정 -----
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true })); // POST 데이터 파싱

// ----- [6] 라우팅 -----

// (a) 홈 페이지 (로그인 화면)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// (b-1) 카카오 로그인 시작
app.get("/auth/kakao", (req, res, next) => {
    // 기존 세션 삭제 후 로그인 진행 (자동 로그인 방지)
    req.logout(() => {
        req.session.destroy();
        next();
    });
}, passport.authenticate("kakao"));

// (c-1) 카카오 로그인 콜백
app.get(
    "/auth/kakao/callback",
    passport.authenticate("kakao", {
        failureRedirect: "/", // 로그인 실패 시 돌아갈 주소
    }),
    (req, res) => {
        // 성공 시
        req.session.loginProvider = "kakao";
        res.redirect("/profile");   // 로그인 성공 시 프로필 페이지로
    }
);

// (b-2) Google 로그인 시작
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// (c-2) Google 로그인 콜백
app.get(
    "/auth/google/callback",
    passport.authenticate("google", {
        failureRedirect: "/",
    }),
    (req, res) => {
        req.session.loginProvider = "google";
        res.redirect("/profile");   // 로그인 성공 시 프로필 페이지로
    }
);

// (d) 프로필 페이지: 로그인 성공 후 사용자 정보 확인 
app.get("/profile", (req, res) => {
    if (!req.user) {
        return res.redirect("/");
    }
    // 로그인 제공자와 사용자 id를 가져오기
    const loginProvider = req.session.loginProvider;
    const userId = req.user.id;
    const userPrefix = `${loginProvider}_${userId}`;

    // user.txt에서 해당 회원 정보 검색
    fs.readFile("user.txt", "utf8", (err, data) => {
        if (err) {
            // 파일 읽기 오류 또는 파일이 없으면 새로 기록
            fs.appendFile("user.txt", userPrefix + "\n", (err2) => {
                if (err2) console.error("user.txt 기록 오류:", err2);
                serveProfileHtml();
            });
        } else {
            const lines = data.split("\n").filter(line => line.trim() !== "");
            const userLine = lines.find(line => line.startsWith(userPrefix));
            if (!userLine) {
                // 회원정보가 없으므로 새로 기록하고 profile.html 제공
                fs.appendFile("user.txt", userPrefix + "\n", (err2) => {
                    if (err2) console.error("user.txt 기록 오류:", err2);
                    serveProfileHtml();
                });
            } else {
                // 회원정보가 존재하는 경우
                const parts = userLine.split("/");
                if (parts.length === 1) {
                    // 회원정보만 존재하는 경우 -> 추가 정보 입력 받음 (profile.html)
                    serveProfileHtml();
                } else if (parts.length === 4) {
                    // 추가 정보(장소, 인원수, 태그)가 이미 존재하는 경우 -> main.html로 이동
                    req.session.submission = {
                        userInfo: parts[0],
                        region: parts[1],
                        num: parts[2],
                        tag: parts[3]
                    };
                    res.redirect("/main");
                } else {
                    // 그 외의 경우도 추가 정보 입력 받음
                    serveProfileHtml();
                }
            }
        }
    });

    function serveProfileHtml() {
        fs.readFile(path.join(__dirname, "public", "profile.html"), "utf8", (err, data) => {
            if (err) return res.status(500).send("프로필 페이지를 불러올 수 없습니다.");
            const output = data.replace("{{loginProvider}}", loginProvider)
                .replace("{{userId}}", userId);
            res.send(output);
        });
    }
});

// (e) 제출 라우트: profile.html에서 입력받은 추가 정보 업데이트
app.post("/submit", (req, res) => {
    if (!req.user) {
        return res.redirect("/");
    }
    const loginProvider = req.session.loginProvider;
    const userId = req.user.id;
    const userPrefix = `${loginProvider}_${userId}`;
    const region = req.body.region;  // 지도에서 선택한 구 (영어 id)
    const num = req.body.num;        // 선택한 인원 수
    const tag = req.body.tag;        // 선택한 태그

    const newLine = `${userPrefix}/${region}/${num}/${tag}`;

    // user.txt 파일 읽어 해당 회원 정보 줄을 업데이트
    fs.readFile("user.txt", "utf8", (err, data) => {
        if (err) return res.status(500).send("파일 읽기 오류");
        let lines = data.split("\n");
        let found = false;
        lines = lines.map(line => {
            if (line.startsWith(userPrefix)) {
                found = true;
                return newLine;
            }
            return line;
        });
        if (!found) {
            // 만약 해당 회원 정보가 없으면 새로 추가
            lines.push(newLine);
        }
        fs.writeFile("user.txt", lines.join("\n"), "utf8", (err) => {
            if (err) return res.status(500).send("파일 쓰기 오류");
            req.session.submission = {
                userInfo: userPrefix,
                region: region,
                num: num,
                tag: tag
            };
            res.redirect("/main");
        });
    });
});

// (f) /main 라우트: main.html 파일의 placeholder 치환 후 응답
app.get("/main", (req, res) => {
    if (!req.session.submission) {
        return res.redirect("/");
    }
    fs.readFile(path.join(__dirname, "public", "main.html"), "utf8", (err, data) => {
        if (err) return res.status(500).send("메인 페이지를 불러올 수 없습니다.");
        const submission = req.session.submission;
        const output = data.replace("{{userInfo}}", submission.userInfo)
            .replace("{{region}}", submission.region)
            .replace("{{num}}", submission.num)
            .replace("{{tag}}", submission.tag);
        res.send(output);
    });
});

// (g) 로그아웃
app.get("/logout", async (req, res) => {
    const KAKAO_LOGOUT_REDIRECT_URI = "http://localhost:8080/";
    const KAKAO_APP_KEY = "0839de029820e644fa50a0c2492a6ec0"; // 카카오 REST API 키 입력

    if (req.session.loginProvider && req.user?.accessToken) {
        try {
            // 카카오 API를 사용하여 강제 로그아웃
            await axios.post(
                "https://kapi.kakao.com/v1/user/logout",
                {},
                {
                    headers: {
                        Authorization: `Bearer ${req.user.accessToken}`,
                    },
                }
            );
            console.log("카카오 서버 로그아웃 완료");
        } catch (err) {
            console.error("카카오 서버 로그아웃 실패:", err);
        }

        req.logout(() => {
            req.session.destroy(() => {
                res.redirect(
                    `https://kauth.kakao.com/oauth/logout?client_id=${KAKAO_APP_KEY}&logout_redirect_uri=${KAKAO_LOGOUT_REDIRECT_URI}`
                );
            });
        });
    }

    else if (req.session.loginProvider === "google") {
        req.logout(() => {
            req.session.destroy(() => {
                res.clearCookie("connect.sid");
                console.log("구글 세션 로그아웃 완료");
                res.send(`
                    <script>
                        window.open("https://accounts.google.com/logout", "_blank", "width=500,height=600");
                        setTimeout(() => {
                            window.location.href = "/";
                        }, 500);
                    </script>
                `);
            });
        });
    }

    else {
        req.logout(() => {
            req.session.destroy(() => {
                res.redirect("/");
            });
        });
    }
});

// ----- [7] 서버 실행 -----
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

app.use(express.urlencoded({ extended: true }));

app.post("/submit", (req, res) => {
    // 로그인 되어 있지 않으면 홈으로 리다이렉트
    if (!req.user) {
        return res.redirect("/");
    }

    const loginProvider = req.session.loginProvider;
    const userId = req.user.id;

    // 폼으로부터 전달된 값
    const region = req.body.region;  // 지도에서 선택한 구 (SVG path의 id)
    const num = req.body.num;        // 선택한 인원 수
    const tag = req.body.tag;        // 선택한 태그

    // 저장할 문자열 생성 (예: kakao_id/동작구/2명/연인)
    const logLine = `${loginProvider}_${userId}/${region}/${num}명/${tag}\n`;

    // user.txt에 이어서 저장
    fs.appendFile("user.txt", logLine, (err) => {
        if (err) {
            console.error("user.txt 기록 오류:", err);
            return res.status(500).send("제출 처리 중 오류가 발생했습니다.");
        }
        console.log("user.txt에 제출 정보 기록됨:", logLine.trim());

        // session에 제출 정보를 저장 (추후 /main에서 치환에 사용)
        req.session.submission = {
            userInfo: `${loginProvider}_${userId}`,
            region: region,
            num: `${num}명`,
            tag: tag
        };

        // 제출 후 /main으로 리다이렉트
        res.redirect("/main");
    });
});

// /main 라우트: main.html 파일의 placeholder를 치환하여 응답
app.get("/main", (req, res) => {
    if (!req.session.submission) {
        return res.redirect("/");
    }

    fs.readFile(path.join(__dirname, "public", "main.html"), "utf8", (err, data) => {
        if (err) {
            return res.status(500).send("메인 페이지를 불러올 수 없습니다.");
        }
        const submission = req.session.submission;
        let output = data.replace("{{userInfo}}", submission.userInfo)
            .replace("{{region}}", submission.region)
            .replace("{{num}}", submission.num)
            .replace("{{tag}}", submission.tag);
        res.send(output);
    });
});