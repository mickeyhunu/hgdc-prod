/**
 * 파일 역할: 구인(업소 선수모집 공고) 목록 / 상세 / 작성·수정 페이지.
 */
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, session, formatPay, timeAgo, splitTags, PAY_TYPE_LABEL } from '../api.js';
import ReportButton from '../components/ReportButton.js';
import Pager from '../components/Pager.js';

let metaCache = null;
async function loadMeta() {
  metaCache = metaCache || await api('/jobs/meta');
  return metaCache;
}

export const JobListPage = {
  components: { Pager },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const meta = ref({ regions: [], payTypes: [], benefits: [] });
    const filters = reactive({
      region: route.query.region || '', payType: route.query.payType || '',
      benefit: route.query.benefit || '', q: route.query.q || ''
    });
    const result = ref({ items: [], total: 0, page: 1, size: 20 });
    const error = ref('');

    async function load() {
      try {
        const params = new URLSearchParams({ ...route.query });
        result.value = await api(`/jobs?${params}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    }

    function apply(page = 1) {
      const query = Object.fromEntries(Object.entries({ ...filters, page }).filter(([, value]) => value && value !== 1));
      router.push({ path: '/jobs', query });
    }

    onMounted(async () => {
      meta.value = await loadMeta();
      load();
    });

    return { session, meta, filters, result, error, apply, formatPay, timeAgo, splitTags, PAY_TYPE_LABEL };
  },
  template: `
    <section>
      <div class="page-head">
        <h2>구인 <small>업소 선수 모집</small></h2>
        <router-link v-if="['business','admin'].includes(session.user?.memberType)" to="/jobs/new" class="btn primary sm">+ 공고 등록</router-link>
      </div>

      <form class="filters" @submit.prevent="apply()">
        <select v-model="filters.region"><option value="">전체 지역</option><option v-for="r in meta.regions" :key="r">{{ r }}</option></select>
        <select v-model="filters.payType"><option value="">급여 전체</option><option v-for="p in meta.payTypes" :key="p" :value="p">{{ PAY_TYPE_LABEL[p] }}</option></select>
        <select v-model="filters.benefit"><option value="">혜택 전체</option><option v-for="b in meta.benefits" :key="b">{{ b }}</option></select>
        <input v-model.trim="filters.q" placeholder="제목·업소명 검색" />
        <button class="btn sm">검색</button>
      </form>

      <p class="error" v-if="error">{{ error }}</p>
      <div class="cards">
        <router-link v-for="job in result.items" :key="job.id" :to="'/jobs/' + job.id" class="card">
          <div class="card-top"><span class="tag">{{ job.region }}</span><span class="muted"><span v-if="!session.user" class="lock">🔒</span>{{ timeAgo(job.bumped_at) }}</span></div>
          <h4>{{ job.title }}</h4>
          <p class="muted">{{ job.store_name }} · {{ job.work_hours || '시간 협의' }}</p>
          <p class="pay">{{ formatPay(job.pay_type, job.pay_amount) }}</p>
          <div class="tags"><span class="tag outline" v-for="b in splitTags(job.benefits)" :key="b">{{ b }}</span></div>
        </router-link>
      </div>
      <p class="empty" v-if="!result.items.length">조건에 맞는 공고가 없습니다.</p>
      <Pager :page="result.page" :size="result.size" :total="result.total" @go="apply" />
    </section>`
};

export const JobDetailPage = {
  components: { ReportButton },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const job = ref(null);
    const error = ref('');
    const notice = ref('');

    onMounted(async () => {
      try {
        job.value = await api(`/jobs/${route.params.id}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    });

    async function bump() {
      try {
        await api(`/jobs/${job.value.id}/bump`, { method: 'POST' });
        notice.value = '끌어올렸습니다.';
      } catch (requestError) {
        notice.value = requestError.message;
      }
    }

    async function remove() {
      if (!confirm('공고를 삭제할까요?')) return;
      await api(`/jobs/${job.value.id}`, { method: 'DELETE' });
      router.replace('/jobs');
    }

    return { job, error, notice, bump, remove, formatPay, timeAgo, splitTags };
  },
  template: `
    <section v-if="job" class="detail">
      <router-link to="/jobs" class="back">← 구인 목록</router-link>
      <div class="detail-head">
        <span class="tag">{{ job.region }}</span>
        <span class="tag" :class="job.status === 'open' ? 'ok' : 'off'">{{ job.status === 'open' ? '모집중' : '마감' }}</span>
        <h2>{{ job.title }}</h2>
        <p class="muted">{{ job.nickname }} · 조회 {{ job.view_count }} · {{ timeAgo(job.created_at) }}</p>
      </div>

      <dl class="spec">
        <dt>업소명</dt><dd>{{ job.store_name }}</dd>
        <dt>급여</dt><dd class="pay">{{ formatPay(job.pay_type, job.pay_amount) }}</dd>
        <dt>근무시간</dt><dd>{{ job.work_hours || '협의' }}</dd>
        <dt>혜택</dt><dd><span class="tag outline" v-for="b in splitTags(job.benefits)" :key="b">{{ b }}</span></dd>
        <dt>연락처</dt><dd class="contact">{{ job.contact }}</dd>
      </dl>
      <div class="content">{{ job.content }}</div>

      <div class="actions">
        <template v-if="job.isMine">
          <button class="btn sm" @click="bump">끌어올리기</button>
          <router-link class="btn sm" :to="'/jobs/' + job.id + '/edit'">수정</router-link>
          <button class="btn sm danger" @click="remove">삭제</button>
        </template>
        <ReportButton v-else target-type="job" :target-id="job.id" />
      </div>
      <p class="muted" v-if="notice">{{ notice }}</p>
      <p class="warn">※ 선불금·신분증 요구 등 사기 의심 시 즉시 신고해주세요. 호구닷컴은 거래 당사자가 아닙니다.</p>
    </section>
    <p class="error" v-else-if="error">{{ error }}</p>`
};

export const JobFormPage = {
  setup() {
    const route = useRoute();
    const router = useRouter();
    const meta = ref({ regions: [], payTypes: [], benefits: [] });
    const isEdit = Boolean(route.params.id);
    const form = reactive({
      title: '', storeName: '', region: '', payType: 'TC', payAmount: '', workHours: '',
      benefits: [], contact: '', content: '', status: 'open'
    });
    const error = ref('');

    onMounted(async () => {
      meta.value = await loadMeta();
      if (isEdit) {
        const job = await api(`/jobs/${route.params.id}`);
        Object.assign(form, {
          title: job.title, storeName: job.store_name, region: job.region, payType: job.pay_type,
          payAmount: job.pay_amount ?? '', workHours: job.work_hours, benefits: splitTags(job.benefits),
          contact: job.contact, content: job.content, status: job.status
        });
      }
    });

    watch(() => form.payType, (payType) => { if (payType === 'NEGOTIABLE') form.payAmount = ''; });

    async function submit() {
      error.value = '';
      try {
        const body = { ...form, payAmount: form.payAmount === '' ? null : Number(form.payAmount) };
        const { id } = isEdit
          ? await api(`/jobs/${route.params.id}`, { method: 'PUT', body })
          : await api('/jobs', { method: 'POST', body });
        router.replace(`/jobs/${id}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    }

    return { session, meta, form, isEdit, error, submit, PAY_TYPE_LABEL };
  },
  template: `
    <section class="form-page">
      <h2>{{ isEdit ? '구인공고 수정' : '구인공고 등록' }}</h2>
      <p class="notice" v-if="!['business','admin'].includes(session.user.memberType)">구인공고는 업소 회원만 등록할 수 있습니다.</p>
      <form v-else class="stack" @submit.prevent="submit">
        <input v-model.trim="form.title" maxlength="100" placeholder="제목 (예: 강남 OO 신규 선수 모집, 숙소 제공)" required />
        <div class="row-2">
          <input v-model.trim="form.storeName" maxlength="50" placeholder="업소명" required />
          <select v-model="form.region" required><option value="" disabled>지역 선택</option><option v-for="r in meta.regions" :key="r">{{ r }}</option></select>
        </div>
        <div class="row-2">
          <select v-model="form.payType"><option v-for="p in meta.payTypes" :key="p" :value="p">{{ PAY_TYPE_LABEL[p] }}</option></select>
          <input v-model="form.payAmount" type="number" min="0" placeholder="금액 (원)" :disabled="form.payType === 'NEGOTIABLE'" />
        </div>
        <input v-model.trim="form.workHours" maxlength="50" placeholder="근무시간 (예: 21시~05시, 주 5일)" />
        <label class="label">혜택</label>
        <div class="checks">
          <label v-for="b in meta.benefits" :key="b" class="check pill" :class="{ on: form.benefits.includes(b) }">
            <input type="checkbox" :value="b" v-model="form.benefits" /> {{ b }}
          </label>
        </div>
        <input v-model.trim="form.contact" maxlength="100" placeholder="연락처 (카톡 ID / 텔레그램 / 전화)" required />
        <textarea v-model="form.content" rows="10" maxlength="5000" placeholder="상세 내용" required></textarea>
        <select v-if="isEdit" v-model="form.status"><option value="open">모집중</option><option value="closed">마감</option></select>
        <p class="error" v-if="error">{{ error }}</p>
        <button class="btn primary">{{ isEdit ? '수정 완료' : '등록하기' }}</button>
      </form>
    </section>`
};
