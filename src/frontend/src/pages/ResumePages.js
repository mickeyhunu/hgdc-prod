/**
 * 파일 역할: 구직(선수 이력서) 목록 / 상세 / 내 이력서 작성 페이지.
 */
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, session, formatCareer, timeAgo, splitTags } from '../api.js';
import ReportButton from '../components/ReportButton.js';
import Pager from '../components/Pager.js';

export const ResumeListPage = {
  components: { Pager },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const regions = ref([]);
    const region = ref(route.query.region || '');
    const result = ref({ items: [], total: 0, page: 1, size: 20 });
    const error = ref('');

    function apply(page = 1) {
      const query = {};
      if (region.value) query.region = region.value;
      if (page > 1) query.page = page;
      router.push({ path: '/resumes', query });
    }

    onMounted(async () => {
      try {
        regions.value = (await api('/jobs/meta')).regions;
        result.value = await api(`/resumes?${new URLSearchParams({ ...route.query })}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    });

    return { session, regions, region, result, error, apply, formatCareer, timeAgo, splitTags };
  },
  template: `
    <section>
      <div class="page-head">
        <h2>구직 <small>선수 프로필</small></h2>
        <router-link v-if="session.user" to="/resumes/mine/edit" class="btn primary sm">내 이력서</router-link>
      </div>
      <form class="filters" @submit.prevent="apply()">
        <select v-model="region" @change="apply()"><option value="">전체 지역</option><option v-for="r in regions" :key="r">{{ r }}</option></select>
      </form>
      <p class="error" v-if="error">{{ error }}</p>
      <div class="cards">
        <router-link v-for="r in result.items" :key="r.id" :to="'/resumes/' + r.id" class="card">
          <div class="card-top"><span class="muted">{{ r.nickname }} · {{ r.age }}세</span><span class="muted"><span v-if="!session.user" class="lock">🔒</span>{{ timeAgo(r.bumped_at) }}</span></div>
          <h4>{{ r.title }}</h4>
          <p class="muted">
            <span v-if="r.height_cm">{{ r.height_cm }}cm</span><span v-if="r.weight_kg"> / {{ r.weight_kg }}kg</span>
            · 경력 {{ formatCareer(r.career_months) }}
          </p>
          <div class="tags"><span class="tag outline" v-for="g in splitTags(r.regions)" :key="g">{{ g }}</span></div>
        </router-link>
      </div>
      <p class="empty" v-if="!result.items.length">등록된 이력서가 없습니다.</p>
      <Pager :page="result.page" :size="result.size" :total="result.total" @go="apply" />
    </section>`
};

export const ResumeDetailPage = {
  components: { ReportButton },
  setup() {
    const route = useRoute();
    const resume = ref(null);
    const error = ref('');
    onMounted(async () => {
      try {
        resume.value = await api(`/resumes/${route.params.id}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    });
    return { resume, error, formatCareer, timeAgo, splitTags };
  },
  template: `
    <section v-if="resume" class="detail">
      <router-link to="/resumes" class="back">← 구직 목록</router-link>
      <div class="detail-head">
        <h2>{{ resume.title }}</h2>
        <p class="muted">{{ resume.nickname }} · 조회 {{ resume.view_count }} · {{ timeAgo(resume.bumped_at) }}</p>
      </div>
      <dl class="spec">
        <dt>나이</dt><dd>만 {{ resume.age }}세 (본인인증)</dd>
        <dt>신체</dt><dd>{{ resume.height_cm || '-' }}cm / {{ resume.weight_kg || '-' }}kg</dd>
        <dt>경력</dt><dd>{{ formatCareer(resume.career_months) }}</dd>
        <dt>희망지역</dt><dd><span class="tag outline" v-for="g in splitTags(resume.regions)" :key="g">{{ g }}</span></dd>
        <dt>가능시간</dt><dd>{{ resume.available_time || '협의' }}</dd>
        <dt>연락처</dt><dd class="contact">{{ resume.contact }}</dd>
      </dl>
      <div class="content">{{ resume.content }}</div>
      <div class="actions">
        <router-link v-if="resume.isMine" class="btn sm" to="/resumes/mine/edit">수정</router-link>
        <ReportButton v-else target-type="resume" :target-id="resume.id" />
      </div>
    </section>
    <p class="error" v-else-if="error">{{ error }}</p>`
};

export const ResumeFormPage = {
  setup() {
    const router = useRouter();
    const regions = ref([]);
    const existingId = ref(null);
    const form = reactive({
      title: '', heightCm: '', weightKg: '', regions: [], careerMonths: 0,
      availableTime: '', contact: '', content: '', isPublic: true
    });
    const error = ref('');
    const notice = ref('');

    onMounted(async () => {
      regions.value = (await api('/jobs/meta')).regions;
      const { resume } = await api('/resumes/mine');
      if (resume) {
        existingId.value = resume.id;
        Object.assign(form, {
          title: resume.title, heightCm: resume.height_cm ?? '', weightKg: resume.weight_kg ?? '',
          regions: splitTags(resume.regions), careerMonths: resume.career_months,
          availableTime: resume.available_time, contact: resume.contact, content: resume.content,
          isPublic: Boolean(resume.is_public)
        });
      }
    });

    async function submit() {
      error.value = '';
      try {
        const toNumber = (value) => (value === '' || value === null ? null : Number(value));
        const { id } = await api('/resumes/mine', {
          method: 'PUT',
          body: { ...form, heightCm: toNumber(form.heightCm), weightKg: toNumber(form.weightKg), careerMonths: Number(form.careerMonths) }
        });
        router.replace(`/resumes/${id}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    }

    async function bump() {
      try {
        await api('/resumes/mine/bump', { method: 'POST' });
        notice.value = '끌어올렸습니다.';
      } catch (requestError) {
        notice.value = requestError.message;
      }
    }

    return { session, regions, existingId, form, error, notice, submit, bump };
  },
  template: `
    <section class="form-page">
      <h2>내 이력서</h2>
      <form class="stack" @submit.prevent="submit">
        <p class="muted">나이는 본인인증 정보로 자동 표시됩니다. 실명·생년월일은 공개되지 않습니다.</p>
        <input v-model.trim="form.title" maxlength="100" placeholder="한 줄 소개 (예: 강남권 경력 2년, 성실합니다)" required />
        <div class="row-2">
          <input v-model="form.heightCm" type="number" min="140" max="220" placeholder="키 (cm)" />
          <input v-model="form.weightKg" type="number" min="40" max="150" placeholder="몸무게 (kg)" />
        </div>
        <div class="row-2">
          <select v-model.number="form.careerMonths">
            <option :value="0">신입</option>
            <option v-for="m in [3,6,12,24,36,60]" :key="m" :value="m">{{ m < 12 ? m + '개월' : (m / 12) + '년' }} 이상</option>
          </select>
          <input v-model.trim="form.availableTime" maxlength="50" placeholder="가능 시간 (예: 주 5일, 야간)" />
        </div>
        <label class="label">희망 지역</label>
        <div class="checks">
          <label v-for="r in regions" :key="r" class="check pill" :class="{ on: form.regions.includes(r) }">
            <input type="checkbox" :value="r" v-model="form.regions" /> {{ r }}
          </label>
        </div>
        <input v-model.trim="form.contact" maxlength="100" placeholder="연락처 (카톡 ID / 텔레그램)" required />
        <textarea v-model="form.content" rows="8" maxlength="3000" placeholder="자기소개" required></textarea>
        <label class="check"><input type="checkbox" v-model="form.isPublic" /> 업소에 이력서 공개</label>
        <p class="error" v-if="error">{{ error }}</p>
        <button class="btn primary">저장</button>
        <button v-if="existingId" type="button" class="btn ghost" @click="bump">끌어올리기</button>
        <p class="muted" v-if="notice">{{ notice }}</p>
      </form>
    </section>`
};
