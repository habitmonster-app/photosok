# 전달본 검사 실행

프로젝트 루트에서 `python3 run_local.py`를 실행하고 아래 주소를 브라우저에서 하나씩 연다.

| 주소 경로 | 검사 |
| --- | --- |
| `/tests/browser-checks.html` | 사진 엔진 |
| `/tests/pdf-checks.html` | 사진→PDF |
| `/tests/pdf-tools-checks.html` | 기존 PDF 입력·합치기·용량 맞춤 |
| `/tests/heic-checks.html` | 실제 HEIC fixture 변환 |
| `/tests/document-editor-checks.html` | 수동 서류 보정 계산 |
| `/tests/file-delivery-checks.html` | 저장·공유 API 모의 검사 |
| `/tests/submission-checks.html` | 앱 통합 |
| `/tests/performance-checks.html` | 과거 v1.2 기준과 현재 엔진 비교 |

예: http://localhost:8000/tests/submission-checks.html

각 검사 결과의 PASS/FAIL과 세부 오류를 기록한다. 일부 검사는 실제 Canvas·PDF·HEIC 처리를 수행하고, 저장/공유 API 등은 모의한다. 통과해도 실제 휴대폰 저장·외부 앱 공유까지 확인된 것은 아니다.

전달본은 HEIC/저장/성능 검사 HTML의 상대 경로를 `/tests/` 실행에 맞췄다. 이 파일들을 다시 dist/_qa/로 옮기면 경로가 맞지 않으므로 여기에서는 옮기지 않는다. 원본 README의 과거 staging 설명보다 이 전달본 안내를 우선한다.

성능 비교 baseline-compress.js와 baseline-pdf.js는 원본 Git 커밋 be9ae862c98a05b50986bcc8320b17e45af1c277의 dist 파일을 그대로 동봉했다. 외부 경쟁 앱의 코드가 아니다. 현재 엔진을 수정하면 과거 개선 폭과 결과도 달라질 수 있다. 시간은 기기·브라우저별로 달라지며 45개 검사의 과거 통과 기록을 이번 환경의 결과로 쓰지 않는다.

fixture는 포함되어 있어 Python 이미지 패키지 설치가 필요 없다. 재생성할 때만 generate-heic-fixtures.py의 의존성을 설치한다. 검사 파일과 baseline은 일반 사용자에게 제공할 dist 배포물에 넣지 않는다.
