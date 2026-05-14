import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyApBVPB9j9A2wDyfu3xNlBBql_zSFi5dT0",
  authDomain: "cafe-zip.firebaseapp.com",
  projectId: "cafe-zip",
  storageBucket: "cafe-zip.firebasestorage.app",
  messagingSenderId: "1065640668931",
  appId: "1:1065640668931:web:af8a023f04f54e9dfd4336"
};

// 파이어베이스 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 이미지 압축 및 Base64 변환 함수 (Firestore 용량 제한 우회)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // 최대 가로 픽셀
        const scaleSize = MAX_WIDTH / img.width;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          width = MAX_WIDTH;
          height = img.height * scaleSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 품질을 0.7로 낮춰서 base64 문자열로 변환 (용량 최적화)
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// DOM 요소를 가져옵니다.
const addBtn = document.getElementById('add-btn');
const inputModal = document.getElementById('input-modal');
const closeInputBtn = document.getElementById('close-input-btn');
const addCafeForm = document.getElementById('add-cafe-form');

const detailModal = document.getElementById('detail-modal');
const closeDetailBtn = document.getElementById('close-detail-btn');
const cafeGrid = document.getElementById('cafe-grid');
const editBtn = document.getElementById('edit-btn');
const deleteBtn = document.getElementById('delete-btn');
const sortSelect = document.getElementById('sort-select');
const toggleHiddenBtn = document.getElementById('toggle-hidden-btn');
const hideBtn = document.getElementById('hide-btn');
const restoreBtn = document.getElementById('restore-btn');

let editingId = null;
let currentDetailData = null;
let allCafes = [];
let uniqueDistricts = new Set();
let isViewingHidden = false;

// 관리자 모드 체크 (?admin=true)
const urlParams = new URLSearchParams(window.location.search);
const isAdmin = urlParams.get('admin') === 'true';

if (!isAdmin) {
  addBtn.style.display = 'none';
  toggleHiddenBtn.style.display = 'none';
}

// 모달 열기/닫기 함수
function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

addBtn.addEventListener('click', () => {
  editingId = null;
  addCafeForm.reset();
  document.querySelector('#input-modal h2').innerText = '새로운 카페 기록';
  openModal(inputModal);
});
closeInputBtn.addEventListener('click', () => closeModal(inputModal));
closeDetailBtn.addEventListener('click', () => closeModal(detailModal));

editBtn.addEventListener('click', () => {
  if (!currentDetailData) return;
  
  document.getElementById('cafe-name').value = currentDetailData.name;
  document.getElementById('cafe-region').value = currentDetailData.region;
  document.getElementById('cafe-address').value = currentDetailData.address;
  document.getElementById('cafe-link').value = currentDetailData.link;
  document.getElementById('cafe-menu').value = currentDetailData.menu;
  document.getElementById('cafe-price').value = currentDetailData.price;
  document.getElementById('cafe-comment').value = currentDetailData.comment || '';
  
  editingId = currentDetailData.id;
  document.querySelector('#input-modal h2').innerText = '카페 기록 수정';
  
  closeModal(detailModal);
  openModal(inputModal);
});

deleteBtn.addEventListener('click', async () => {
  if (!currentDetailData) return;
  if (confirm("정말로 이 기록을 삭제하시겠습니까?")) {
    try {
      await deleteDoc(doc(db, "cafes", currentDetailData.id));
      closeModal(detailModal);
    } catch (error) {
      console.error("Error deleting document: ", error);
      alert("삭제 중 오류가 발생했습니다.");
    }
  }
});

hideBtn.addEventListener('click', async () => {
  if (!currentDetailData) return;
  if (confirm("이 기록을 숨기시겠습니까?")) {
    try {
      await updateDoc(doc(db, "cafes", currentDetailData.id), { isHidden: true });
      closeModal(detailModal);
    } catch (error) {
      console.error("Error hiding document: ", error);
      alert("숨기기 중 오류가 발생했습니다.");
    }
  }
});

restoreBtn.addEventListener('click', async () => {
  if (!currentDetailData) return;
  if (confirm("이 기록을 복구하시겠습니까?")) {
    try {
      await updateDoc(doc(db, "cafes", currentDetailData.id), { isHidden: false });
      closeModal(detailModal);
    } catch (error) {
      console.error("Error restoring document: ", error);
      alert("복구 중 오류가 발생했습니다.");
    }
  }
});

toggleHiddenBtn.addEventListener('click', () => {
  isViewingHidden = !isViewingHidden;
  toggleHiddenBtn.innerText = isViewingHidden ? '홈 화면으로 돌아가기' : '숨겨진 카페 보기';
  document.querySelector('h1').innerText = isViewingHidden ? 'hidden archive' : 'cafe archive';
  updateSortDropdown();
  renderCafes();
});

// 모달 바깥 영역 클릭시 닫기
window.addEventListener('click', (e) => {
  if (e.target === inputModal) closeModal(inputModal);
  if (e.target === detailModal) closeModal(detailModal);
});

// 데이터 저장하기
addCafeForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('cafe-name').value;
  const region = document.getElementById('cafe-region').value;
  const address = document.getElementById('cafe-address').value;
  const link = document.getElementById('cafe-link').value;
  const menu = document.getElementById('cafe-menu').value;
  const price = document.getElementById('cafe-price').value;
  const comment = document.getElementById('cafe-comment').value;
  const imageInput = document.getElementById('cafe-image');
  const file = imageInput.files[0];
  const thumbnailInput = document.getElementById('cafe-thumbnail');
  const thumbFile = thumbnailInput.files[0];

  // 태그로 쓸 정보들 배열화
  const tags = [region, address.split(' ')[0], menu]; // 예: ['망원', '서울시', '버터푸딩']

  try {
    // 1. 이미지를 Base64 문자열로 압축 변환하여 직접 저장
    let imageUrl = editingId ? currentDetailData.imageUrl : 'https://via.placeholder.com/400x300?text=No+Image';
    if (file) {
      imageUrl = await compressImage(file);
    }
    
    let thumbnailUrl = editingId ? (currentDetailData.thumbnailUrl || currentDetailData.imageUrl) : 'https://via.placeholder.com/400x300?text=No+Thumbnail';
    if (thumbFile) {
      thumbnailUrl = await compressImage(thumbFile);
    }

    if (editingId) {
      // 2-1. 기존 데이터 수정
      await updateDoc(doc(db, "cafes", editingId), {
        name,
        region,
        address,
        link,
        menu,
        price,
        comment,
        imageUrl,
        thumbnailUrl,
        tags
      });
    } else {
      // 2-2. Firestore의 'cafes' 컬렉션에 추가
      await addDoc(collection(db, "cafes"), {
        name,
        region,
        address,
        link,
        menu,
        price,
        comment,
        imageUrl,
        thumbnailUrl,
        tags,
        isHidden: false,
        createdAt: new Date()
      });
    }
    
    // 폼 초기화 및 모달 닫기
    addCafeForm.reset();
    editingId = null;
    closeModal(inputModal);
    
  } catch (error) {
    console.error("Error adding document: ", error);
    alert("파이어베이스 설정이 필요합니다. 코드를 확인해주세요!");
  }
});

// 데이터 불러오기 및 렌더링
function loadCafes() {
  const q = query(collection(db, "cafes"), orderBy("createdAt", "desc"));
  
  onSnapshot(q, (snapshot) => {
    allCafes = [];
    uniqueDistricts.clear();
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      data.id = doc.id;
      allCafes.push(data);
      
      const dist = extractDistrict(data.address);
      if (dist) uniqueDistricts.add(dist);
    });
    
    updateSortDropdown();
    renderCafes();
  }, (error) => {
    console.error("Error fetching data:", error);
  });
}

function updateSortDropdown() {
  const currentSelection = sortSelect.value;
  sortSelect.innerHTML = '<option value="all">전체 보기 (최신순)</option>';
  
  const visibleCafes = allCafes.filter(a => isViewingHidden ? a.isHidden : !a.isHidden);
  const currentDistricts = new Set(visibleCafes.map(a => extractDistrict(a.address)).filter(d => d));
  
  const sortedDistricts = Array.from(currentDistricts).sort();
  sortedDistricts.forEach(dist => {
    const option = document.createElement('option');
    option.value = dist;
    option.innerText = dist;
    sortSelect.appendChild(option);
  });
  
  if (sortedDistricts.includes(currentSelection) || currentSelection === 'all') {
    sortSelect.value = currentSelection;
  }
}

function extractDistrict(address) {
  if (!address) return '';
  const words = address.split(' ');
  for (let word of words) {
    if (word.endsWith('구')) {
      return word;
    }
  }
  return '';
}

function renderCafes() {
  cafeGrid.innerHTML = ''; // 초기화
  const sortMode = sortSelect.value;
  
  let displayList = allCafes.filter(a => isViewingHidden ? a.isHidden : !a.isHidden);
  
  if (sortMode !== 'all') {
    displayList = displayList.filter(a => extractDistrict(a.address) === sortMode);
  }
  
  displayList.forEach(data => {
    const cafeCard = document.createElement('div');
    cafeCard.className = 'cafe-card';
    
    cafeCard.innerHTML = `
      <div class="image-container">
        <img src="${data.thumbnailUrl || data.imageUrl || 'https://via.placeholder.com/400x300?text=No+Thumbnail'}" alt="${data.name} 썸네일">
      </div>
      <div class="cafe-info">
        <div class="cafe-name-display">${data.name}</div>
        <div class="cafe-region-display">${data.region}</div>
      </div>
    `;

    // 카드 클릭 시 상세 모달 열기
    cafeCard.addEventListener('click', () => showDetail(data));

    cafeGrid.appendChild(cafeCard);
  });
}

sortSelect.addEventListener('change', renderCafes);

// 상세 모달 정보 채우기
function showDetail(data) {
  currentDetailData = data;
  document.getElementById('detail-name').innerText = data.name;
  document.getElementById('detail-address').innerText = data.address;
  document.getElementById('detail-menu').innerText = data.menu;
  document.getElementById('detail-price').innerText = data.price;
  document.getElementById('detail-link').href = data.link;

  const mapIframe = document.getElementById('detail-map');
  const encodedAddress = encodeURIComponent(data.address);
  mapIframe.src = `https://maps.google.com/maps?q=${encodedAddress}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

  const detailComment = document.getElementById('detail-comment');
  if (data.comment) {
    detailComment.innerText = `"${data.comment}"`;
    detailComment.style.display = 'block';
  } else {
    detailComment.style.display = 'none';
  }

  const imagePlaceholder = document.getElementById('detail-image-placeholder');
  imagePlaceholder.innerHTML = `<img src="${data.imageUrl}" alt="${data.name} 상세 사진">`;

  const tagsContainer = document.getElementById('detail-tags');
  tagsContainer.innerHTML = '';
  
  if (data.tags) {
    data.tags.forEach(tag => {
      if(tag) { // 빈 문자열 방지
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.innerText = `#${tag}`;
        tagsContainer.appendChild(tagSpan);
      }
    });
  }

  if (!isAdmin) {
    hideBtn.style.display = 'none';
    restoreBtn.style.display = 'none';
    editBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
  } else {
    editBtn.style.display = 'inline-block';
    deleteBtn.style.display = 'inline-block';
    if (data.isHidden) {
      hideBtn.style.display = 'none';
      restoreBtn.style.display = 'inline-block';
    } else {
      hideBtn.style.display = 'inline-block';
      restoreBtn.style.display = 'none';
    }
  }

  openModal(detailModal);
}

// 앱 실행 시 데이터 불러오기 시작
loadCafes();
