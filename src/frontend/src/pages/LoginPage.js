/**
 * 파일 역할: 19세 이용제한 안내 + 로그인 페이지. 상세 내용 열람 시 비회원은 이 화면으로 온다.
 */
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, session } from '../api.js';

export default {
  setup() {
    const route = useRoute();
    const router = useRouter();
    const form = reactive({ loginId: '', password: '' });
    const error = ref('');
    const loading = ref(false);

    async function submit() {
      error.value = '';
      loading.value = true;
      try {
        await api('/auth/login', { method: 'POST', body: form });
        const { user } = await api('/auth/me');
        session.user = user;
        const next = String(route.query.next || '/');
        router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      } catch (requestError) {
        error.value = requestError.message;
      } finally {
        loading.value = false;
      }
    }

    return { form, error, loading, submit };
  },
  template: `
    <section class="gate">
      <div class="gate-card">
        <div class="badge-19 big">19</div>
        <h1>호구<span>닷컴</span></h1>
        <!-- 호빠의 '호' + 구인구직의 '구' = 호구닷컴 -->
        <p class="gate-sub"><span class="hogu">호</span>빠선수 <span class="hogu">구</span>인구직 · 커뮤니티</p>
        <div class="notice">
          이 정보내용은 <b>청소년 유해매체물</b>로서 정보통신망 이용촉진 및 정보보호 등에 관한 법률 및
          청소년보호법에 따라 <b>19세 미만의 청소년이 이용할 수 없습니다.</b>
        </div>

        <form class="stack" @submit.prevent="submit">
          <input v-model.trim="form.loginId" placeholder="아이디" autocomplete="username" required />
          <input v-model="form.password" type="password" placeholder="비밀번호" autocomplete="current-password" required />
          <p class="error" v-if="error">{{ error }}</p>
          <button class="btn primary" :disabled="loading">{{ loading ? '로그인 중…' : '성인 회원 로그인' }}</button>
        </form>

        <router-link to="/signup" class="btn ghost">19세 이상 본인인증 후 회원가입</router-link>
        <router-link to="/" class="exit">로그인 없이 둘러보기</router-link>
      </div>
    </section>`
};
