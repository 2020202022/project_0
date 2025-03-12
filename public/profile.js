document.addEventListener("DOMContentLoaded", function () {
    const mapObject = document.getElementById("seoulMap");
    const hiddenRegionInput = document.getElementById("selectedRegion");

    // 각 구역의 순서에 따른 영어 id 매핑 (SVG 파일 내 path 순서에 맞게 작성)
    const regionOrderMapping = [
        "songpa", "gangdong", "gwangjin", "dobong",
        "nowon", "gangbuk", "seongbuk", "jungnang",
        "dongdaemun", "jongno", "jung", "seongdong",
        "yongsan", "mapo", "gangseo", "yangcheon",
        "yeongdeungpo", "guro", "geumcheon", "dongjak",
        "gwanak", "seocho", "gangnam", "eunpyeong", "seodaemun"
    ];

    mapObject.addEventListener("load", function () {
        const svgDoc = mapObject.contentDocument || mapObject.getSVGDocument();  // SVG 내부 접근
        if (!svgDoc) {
            console.error("SVG 로드 실패: contentDocument를 찾을 수 없음");
            return;
        }

        const regions = svgDoc.querySelectorAll("path"); // 그룹 안의 path 태그 찾기

        regions.forEach((region, index) => {
            const bbox = region.getBBox(); // 요소의 크기와 위치 정보 가져오기
            const cx = bbox.x + bbox.width / 2; // 중심 X 좌표
            const cy = bbox.y + bbox.height / 2; // 중심 Y 좌표

            // 원래 색상 저장
            const originalColor = region.getAttribute("fill");

            // dataset 초기화: 선택 여부를 false로 설정
            region.dataset.selected = "false";

            // 마우스 오버 시 확대 및 색 변경
            region.addEventListener("mouseover", function () {
                if (region.dataset.selected === "false") {
                    this.setAttribute("transform", `translate(${cx},${cy}) scale(1.03) translate(${-cx},${-cy})`);
                    this.style.fill = "rgb(135, 216, 29)";
                }
            });

            // 마우스가 벗어나면 원래 크기 및 색상으로 복귀
            region.addEventListener("mouseout", function () {
                if (region.dataset.selected === "false") {
                    this.removeAttribute("transform");
                    this.style.fill = "rgb(96, 169, 15)"; // 원래 색상으로 복귀
                }
            });

            // 클릭 이벤트: 한 번에 하나의 구역만 선택되도록 함
            region.addEventListener("click", function () {
                // 클릭한 구역이 이미 선택된 경우에는 선택 해제
                if (region.dataset.selected === "true") {
                    region.dataset.selected = "false";
                    region.removeAttribute("transform");
                    region.style.fill = "rgb(96, 169, 15)";
                    hiddenRegionInput.value = "";
                } else {
                    // 다른 모든 구역 선택 해제
                    regions.forEach(otherRegion => {
                        if (otherRegion.dataset.selected === "true") {
                            otherRegion.dataset.selected = "false";
                            otherRegion.removeAttribute("transform");
                            otherRegion.style.fill = "rgb(96, 169, 15)";
                        }
                    });
                    // 클릭한 구역 선택 상태 적용
                    region.dataset.selected = "true";
                    region.setAttribute("transform", `translate(${cx},${cy}) scale(1.03) translate(${-cx},${-cy})`);
                    region.style.fill = "rgb(135, 216, 29)";
                    // 인덱스를 이용해서 영어 id 추출
                    const regionEnglishId = regionOrderMapping[index] || "";
                    hiddenRegionInput.value = regionEnglishId;
                }
            });
        });
    });
});
// **** 장소, 인원수, 태그 중 선택 안 된 거 있으면 선택하라고 alter 메시지 추가해야됨 *****