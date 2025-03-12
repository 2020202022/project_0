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
        res.redirect("/profile");   // 로그인 성공 시 프로필 페이지로 *수정*
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
    // user.txt에 한 줄씩 기록 (예: kakao_394xxx 또는 google_123xxx)
    const logLine = `${loginProvider}_${userId}\n`;
    fs.appendFile("user.txt", logLine, (err) => {
        if (err) {
            console.error("user.txt 기록 오류:", err);
        } else {
            console.log("user.txt에 정보 기록됨:", logLine.trim());
        }
    });
    // profile.html 파일을 읽어와서 placeholder 치환 후 응답
    fs.readFile(path.join(__dirname, "public", "profile.html"), "utf8", (err, data) => {
        if (err) {
            return res.status(500).send("프로필 페이지를 불러올 수 없습니다.");
        }
        // 치환: {{loginProvider}}와 {{userId}}를 실제 값으로 대체
        let output = data.replace("{{loginProvider}}", loginProvider)
            .replace("{{userId}}", userId);
        res.send(output);
    });
});

// (e) 로그아웃
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