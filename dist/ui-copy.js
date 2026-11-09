'use strict';
// PhotoSok's screen vocabulary. This module contains presentation only; it does
// not change compression, PDF encoding, decoding, or third-party licenses.
(() => {
  const freeze = value => {
    Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); });
    return Object.freeze(value);
  };
  window.PhotoSokCopy = freeze({
    actions: {
      choose: '파일 담기', demo: '샘플 서류로 살펴보기',
      empty: '파일을 담으면 시작할 수 있어요', importing: '담은 파일을 읽고 있어요',
      photoBusy: '사진을 새로 준비하고 있어요', pdfBusy: '페이지를 모으고 있어요',
      pdfCreate: 'PDF 만들기'
    },
    flow: '파일 담기 → 저장 조건 고르기 → 결과 확인',
    workflows: {
      photo: {
        title: '사진으로 저장', detail: '용량 · 크기 · 형식',
        emptyHeading: '사진과 PDF를 담아주세요',
        fileHint: 'JPG · PNG · WebP · HEIC · PDF 페이지를 사진으로'
      },
      pdf: {
        title: 'PDF로 모으기', detail: '페이지·용량 정리',
        emptyHeading: '한 파일로 모을 자료를 담아주세요',
        fileHint: '사진과 PDF를 함께 · 최대 20페이지'
      }
    },
    photoModes: {
      compress: {
        label: '용량 줄이기', heading: '사진 한 장의 제한 용량', icon: 'shrink',
        outputLabel: 'JPG로 준비 · 원본 파일 유지',
        metadataOnNote: '위치·촬영정보를 뺀 새 JPG를 만들어요. 투명한 부분은 흰색으로 바뀌어요.',
        metadataOffNote: '이미 작은 사진은 원본 형식과 촬영정보가 남을 수 있어요. JPG로 바꾸면 투명한 부분은 흰색이 돼요.'
      },
      resize: {
        label: '크기 조절', heading: '사진의 긴 쪽 길이', icon: 'resize',
        outputLabel: 'JPG로 준비 · 원본 파일 유지',
        outputNote: '비율을 유지한 새 JPG를 만들어요. 촬영정보는 제외하고 투명한 부분은 흰색으로 바꿔요.'
      },
      convert: {
        label: '형식 변환', heading: '저장할 사진 형식', icon: 'convert',
        outputLabel: '고른 형식으로 준비 · 원본 파일 유지',
        outputNote: '새 파일에는 촬영정보를 넣지 않아요. PNG·WebP는 투명한 부분을 유지해요.'
      }
    },
    pdfModes: {
      target: {
        label: '용량 맞추기', heading: '완성할 PDF의 제한 용량',
        note: '전체 용량에 맞추려고 PDF 페이지를 사진으로 바꿔요. 기존의 글자 검색·텍스트 선택은 사라져요.',
        outputNote: '페이지를 이미지로 저장하면서 위치·촬영정보를 제외해요. 페이지에 보이는 글자와 개인정보는 그대로 남아요.',
        previewNote: '사진 페이지로 묶은 PDF예요. 글자 검색·텍스트 선택은 지원하지 않으니 작은 글씨를 확대해 확인해주세요.',
        resultHeading: '설정한 용량 안으로 준비됐어요', ready: '용량 확인 완료'
      },
      preserve: {
        label: '글자 유지 · 합치기', heading: '페이지를 한 파일로 정리',
        note: '기존 PDF의 페이지 내용을 유지해요. 사진에는 글자 검색을 추가하지 않아요. 용량은 맞추지 않으며, 양식·전자서명 보존은 보장하지 않아요.',
        outputNote: 'PDF 페이지는 원래 크기로, 사진은 선택한 페이지 모양으로 묶어요. 기존 메타데이터를 일괄 삭제하지 않아요.',
        previewNote: '기존 PDF에 있던 검색 가능한 글자는 유지해요. 사진·스캔본에 OCR을 추가하지 않아요. 양식·전자서명은 별도로 확인해주세요.',
        resultHeading: '페이지를 한 파일로 모았어요', ready: '페이지 정리 완료'
      }
    },
    results: {
      previousPdf: '이전 PDF가 남아 있어요',
      checkPages: '저장 전에 페이지 순서와 작은 글씨를 살펴보세요.',
      changed: '페이지나 저장 조건을 바꿨어요. 다시 만들면 반영돼요.'
    }
  });
})();
