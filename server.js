const express = require("express");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const KakaoStrategy = require("passport-kakao").Strategy;
const axios = require("axios");

const app = express();
const PORT = 8080;

// ----- [1] 세션 설정 -----
app.use(
    session({
        secret: "choijh", // 원하는 문자열
        resave: false,
        saveUninitialized: false,
    })
);

// ----- [2] Passport 초기화 -----
app.use(passport.initialize());
app.use(passport.session());

// ----- [3] Passport 전략 설정 -----
passport.use(
    new KakaoStrategy(
        {
            clientID: "0839de029820e644fa50a0c2492a6ec0", // 카카오 디벨로퍼스에서 발급받은 REST API 키
            callbackURL: "/auth/kakao/callback", // 카카오 인증 후 돌아올 주소
        },
        async (accessToken, refreshToken, profile, done) => {
            // profile: 카카오에서 보내주는 사용자 정보
            try {
                console.log("Kakao profile:", profile);

                // 실제 서비스에서는 DB 조회 또는 회원가입 로직을 넣어야 함
                // 여기서는 간단히 profile 정보만 넘겨서 세션에 저장한다고 가정
                const user = {
                    id: profile.id,
                    accessToken: accessToken,   // 로그아웃 시 사용
                };
                return done(null, user);
            } catch (err) {
                return done(err);
            }
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

// (a) 홈 화면: login.html을 보여주기
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// (b) 카카오 로그인 시작
app.get("/auth/kakao", (req, res, next) => {
    // 기존 세션 삭제 후 로그인 진행 (자동 로그인 방지)
    req.logout(() => {
        req.session.destroy();
        next();
    });
}, passport.authenticate("kakao"));

// (c) 카카오 로그인 콜백
app.get(
    "/auth/kakao/callback",
    passport.authenticate("kakao", {
        failureRedirect: "/", // 로그인 실패 시 돌아갈 주소
    }),
    (req, res) => {
        // 성공 시
        res.redirect("/profile");
    }
);

// (d) 프로필 페이지: 로그인 성공 후 사용자 정보 확인
app.get("/profile", (req, res) => {
    if (!req.user) {
        return res.redirect("/");
    }
    res.send(`
    <h1>Profile</h1>
    <p>로그인 성공!</p>
    <p>사용자 ID: ${req.user.id}</p>
    <a href="/logout">로그아웃</a>
  `);
});

// (e) 로그아웃
app.get("/logout", async (req, res) => {
    const KAKAO_LOGOUT_REDIRECT_URI = "http://localhost:8080/";
    const KAKAO_APP_KEY = "0839de029820e644fa50a0c2492a6ec0"; // 카카오 REST API 키 입력

    if (req.user && req.user.accessToken) {
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
    }

    req.logout(() => {
        req.session.destroy(() => {
            res.redirect(
                `https://kauth.kakao.com/oauth/logout?client_id=${KAKAO_APP_KEY}&logout_redirect_uri=${KAKAO_LOGOUT_REDIRECT_URI}`
            );
        });
    });
});



// ----- [7] 서버 실행 -----
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});