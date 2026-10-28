/**
 * 파일 역할: KCP 본인인증(19세 확인) → 회원정보 입력 → 가입 페이지.
 *
 * 1) /api/auth/identity 로 거래등록 → call_url 로 팝업 form POST (KCP 표준 방식)
 * 2) 콜백 페이지가 postMessage(HGDC_IDENTITY_RESULT) 를 보내면 /api/auth/identity/:key 로 인증 결과 확인
 * 3) 성인이고 미가입자면 가입 폼 노출. 이름/생년월일/휴대전화는 인증값 자동입력(수정 불가)이며,
 *    아이디/닉네임은 /api/auth/check 로 중복확인 후 가입할 수 있다.
 *    가입 시에도 서버는 화면 값이 아닌 인증 결과를 직접 저장한다.
 */
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, session } from '../api.js';
import AgreementBox from '../components/AgreementBox.js';

function openKcpWindow(callUrl, regCertKey) {
  const width = 410;
  const height = 560;
  const popupName = `kcp_auth_${Date.now()}`;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const popup = isMobile ? null : window.open('', popupName,
    `width=${width},height=${height},left=${(screen.width - width) / 2},top=${(screen.height - height) / 2}`);

  const form = document.createElement('form');
  form.method = 'post';
  form.action = callUrl;
  form.target = popup ? popupName : '_self';
  for (const [name, value] of Object.entries({ reg_cert_key: regCertKey, kcp_page_submit_yn: popup ? 'N' : 'Y' })) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

export default {
  components: { AgreementBox },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const step = ref('intro'); // intro → waiting → form | blocked | duplicated
    const identity = ref(null);
    const regCertKey = ref('');
    const error = ref('');
    const form = reactive({
      loginId: '', password: '', passwordConfirm: '', nickname: '', email: '',
      agreeTerms: false, agreePrivacy: false, agreeMarketing: false
    });
    // 아이디/닉네임 중복확인 결과: { value, available, message }
    const checks = reactive({ loginId: null, nickname: null });

    async function checkField(field) {
      const value = form[field].trim();
      if (!value) {
        checks[field] = null;
        return;
      }
      try {
        const result = await api(`/auth/check?field=${field}&value=${encodeURIComponent(value)}`);
        if (form[field].trim() === value) checks[field] = { value, ...result };
      } catch (requestError) {
        checks[field] = { value, available: false, message: requestError.message };
      }
    }

    function isChecked(field) {
      return checks[field]?.available && checks[field].value === form[field].trim();
    }

    async function loadIdentity(key) {
      regCertKey.value = key;
      try {
        const result = await api(`/auth/identity/${encodeURIComponent(key)}`);
        if (!result.verified) throw new Error('본인인증이 완료되지 않았습니다.');
        identity.value = result;
        step.value = !result.isAdult ? 'blocked' : (result.alreadyRegistered ? 'duplicated' : 'form');
      } catch (requestError) {
        error.value = requestError.message;
        step.value = 'intro';
      }
    }

    function onMessage(event) {
      if (event.origin !== window.location.origin || event.data?.type !== 'HGDC_IDENTITY_RESULT') return;
      const payload = event.data.payload || {};
      if (!payload.success) {
        error.value = payload.message || '본인인증에 실패했습니다.';
        step.value = 'intro';
        return;
      }
      loadIdentity(payload.regCertKey);
    }

    async function startIdentity() {
      error.value = '';
      try {
        const registration = await api('/auth/identity', { method: 'POST' });
        step.value = 'waiting';
        openKcpWindow(registration.callUrl, registration.regCertKey);
      } catch (requestError) {
        error.value = requestError.message;
      }
    }

    async function submit() {
      error.value = '';
      if (form.password !== form.passwordConfirm) {
        error.value = '비밀번호가 일치하지 않습니다.';
        return;
      }
      await Promise.all(['loginId', 'nickname'].filter((field) => !isChecked(field)).map(checkField));
      if (!isChecked('loginId') || !isChecked('nickname')) {
        error.value = '아이디와 닉네임 중복확인을 통과해야 가입할 수 있습니다.';
        return;
      }
      try {
        const { passwordConfirm, ...body } = form;
        await api('/auth/signup', { method: 'POST', body: { ...body, regCertKey: regCertKey.value } });
        const { user } = await api('/auth/me');
        session.user = user;
        router.replace('/');
      } catch (requestError) {
        error.value = requestError.message;
      }
    }

    onMounted(() => {
      window.addEventListener('message', onMessage);
      // 모바일(페이지 이동 방식) 인증 후 콜백이 /signup?regCertKey= 로 돌려보낸 경우
      if (route.query.regCertKey) {
        if (route.query.ok === '1') loadIdentity(String(route.query.regCertKey));
        else error.value = '본인인증에 실패했습니다. 다시 시도해주세요.';
      }
    });
    onBeforeUnmount(() => window.removeEventListener('message', onMessage));

    return { step, identity, error, form, checks, checkField, isChecked, startIdentity, submit };
  },
  template: `
    <section class="gate">
      <div class="gate-card wide">
        <router-link to="/login" class="back">← 로그인</router-link>
        <h2>회원가입</h2>

        <template v-if="step === 'intro' || step === 'waiting'">
          <div class="notice">
            호구닷컴은 <b>19세 이상 성인</b>만 이용할 수 있습니다.<br />
            휴대폰 본인인증(KCP)으로 나이를 확인하며, <b>1인 1계정</b>만 가입 가능합니다.
          </div>
          <p class="error" v-if="error">{{ error }}</p>
          <button class="btn primary" @click="startIdentity">
            {{ step === 'waiting' ? '인증창을 다시 열기' : '휴대폰 본인인증 시작' }}
          </button>
          <p class="muted" v-if="step === 'waiting'">인증창에서 인증을 완료해주세요…</p>
        </template>

        <template v-else-if="step === 'blocked'">
          <div class="notice danger">
            <b>{{ identity.maskedName }}</b>님은 만 {{ identity.age }}세로 확인되어 가입할 수 없습니다.<br />
            청소년보호법에 따라 19세 미만은 이용이 제한됩니다.
          </div>
        </template>

        <template v-else-if="step === 'duplicated'">
          <div class="notice">
            이미 가입된 회원입니다. (아이디: <b>{{ identity.maskedLoginId }}</b>)
          </div>
          <router-link class="btn primary" to="/login">로그인하러 가기</router-link>
        </template>

        <form v-else class="stack" @submit.prevent="submit">
          <label class="field">
            <span>아이디 <b class="req">*</b></span>
            <input v-model.trim="form.loginId" placeholder="영문 소문자/숫자 4~20자" autocomplete="username" required
              @input="checks.loginId = null" @blur="checkField('loginId')" />
            <small v-if="checks.loginId" :class="checks.loginId.available ? 'ok-text' : 'error'">{{ checks.loginId.message }}</small>
          </label>
          <label class="field">
            <span>비밀번호 <b class="req">*</b></span>
            <input v-model="form.password" type="password" placeholder="8자 이상" autocomplete="new-password" required />
          </label>
          <label class="field">
            <span>비밀번호 확인 <b class="req">*</b></span>
            <input v-model="form.passwordConfirm" type="password" placeholder="비밀번호를 한 번 더 입력" autocomplete="new-password" required />
            <small class="error" v-if="form.passwordConfirm && form.password !== form.passwordConfirm">비밀번호가 일치하지 않습니다.</small>
          </label>
          <label class="field">
            <span>이름</span>
            <input :value="identity.profile.name" readonly tabindex="-1" />
          </label>
          <label class="field">
            <span>닉네임 <b class="req">*</b></span>
            <input v-model.trim="form.nickname" placeholder="한글/영문/숫자 2~12자" required
              @input="checks.nickname = null" @blur="checkField('nickname')" />
            <small v-if="checks.nickname" :class="checks.nickname.available ? 'ok-text' : 'error'">{{ checks.nickname.message }}</small>
          </label>
          <label class="field">
            <span>생년월일</span>
            <input :value="identity.profile.birthDate" readonly tabindex="-1" />
          </label>
          <label class="field">
            <span>휴대전화</span>
            <input :value="identity.profile.phone" readonly tabindex="-1" />
          </label>
          <label class="field">
            <span>이메일 <small class="muted">(선택)</small></span>
            <input v-model.trim="form.email" type="email" placeholder="example@email.com" autocomplete="email" />
          </label>

          <AgreementBox :form="form" />

          <p class="error" v-if="error">{{ error }}</p>
          <button class="btn primary">가입하기</button>
        </form>
      </div>
    </section>`
};
