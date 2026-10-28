/**
 * 파일 역할: 헤더 우측 알림 버튼 + 프로필 버튼(드롭다운: 내 정보 / 로그아웃).
 *
 * 알림은 아직 백엔드가 없어 빈 목록 드롭다운만 띄운다. (알림 API 추가 시 items 를 채우면 됨)
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, session, memberLabel } from '../api.js';

export default {
  setup() {
    const route = useRoute();
    const router = useRouter();
    const root = ref(null);
    const open = ref(null); // 'noti' | 'profile' | null
    const notifications = ref([]);
    const initial = computed(() => (session.user?.nickname || '?').slice(0, 1));

    function toggle(menu) {
      open.value = open.value === menu ? null : menu;
    }

    function onDocumentClick(event) {
      if (root.value && !root.value.contains(event.target)) open.value = null;
    }

    function onKeydown(event) {
      if (event.key === 'Escape') open.value = null;
    }

    async function logout() {
      open.value = null;
      await api('/auth/logout', { method: 'POST' });
      session.user = null;
      router.replace({ name: 'home' });
    }

    watch(() => route.fullPath, () => { open.value = null; });
    onMounted(() => {
      document.addEventListener('click', onDocumentClick);
      document.addEventListener('keydown', onKeydown);
    });
    onBeforeUnmount(() => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeydown);
    });

    return { session, root, open, notifications, initial, toggle, logout, memberLabel };
  },
  template: `
    <div class="header-menu" ref="root">
      <div class="hm-item">
        <button type="button" class="icon-btn" :class="{ on: open === 'noti' }" aria-label="알림" @click="toggle('noti')">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span class="dot" v-if="notifications.length"></span>
        </button>
        <div class="dropdown" v-if="open === 'noti'">
          <p class="dropdown-title">알림</p>
          <p class="dropdown-empty" v-if="!notifications.length">새 알림이 없습니다.</p>
        </div>
      </div>

      <div class="hm-item">
        <button type="button" class="avatar" :class="{ on: open === 'profile' }" aria-label="프로필 메뉴" @click="toggle('profile')">
          {{ initial }}
        </button>
        <div class="dropdown" v-if="open === 'profile'">
          <div class="dropdown-profile">
            <span class="avatar sm">{{ initial }}</span>
            <div>
              <b>{{ session.user.nickname }}</b>
              <p>{{ memberLabel(session.user) }}</p>
            </div>
          </div>
          <router-link to="/my" class="dropdown-item">👤 내 정보</router-link>
          <button type="button" class="dropdown-item danger" @click="logout">↪ 로그아웃</button>
        </div>
      </div>
    </div>`
};
