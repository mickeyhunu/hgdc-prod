/**
 * 파일 역할: 마이페이지. 내 이력서 / 사업자 인증 상태 / 내 구인공고 바로가기.
 */
import { onMounted, ref } from 'vue';
import { api, session, canPostJob, memberLabel } from '../api.js';

export default {
  setup() {
    const jobs = ref([]);
    const resume = ref(null);
    onMounted(async () => {
      resume.value = (await api('/resumes/mine')).resume;
      if (canPostJob(session.user)) jobs.value = (await api('/jobs/mine')).items;
    });
    return { session, jobs, resume, canPostJob, memberLabel };
  },
  template: `
    <section>
      <div class="panel">
        <h2>{{ session.user.nickname }}</h2>
        <p class="muted">{{ session.user.loginId }} · {{ memberLabel(session.user) }} · <span class="ok-text">19세 본인인증 완료</span></p>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>내 이력서</h3><router-link to="/resumes/mine/edit">{{ resume ? '수정' : '작성' }}</router-link></div>
        <router-link v-if="resume" :to="'/resumes/' + resume.id" class="row">
          <span class="tag" :class="resume.is_public ? 'ok' : 'off'">{{ resume.is_public ? '공개' : '비공개' }}</span>
          <span class="row-title">{{ resume.title }}</span>
          <span class="muted">조회 {{ resume.view_count }}</span>
        </router-link>
        <p class="empty" v-else>아직 이력서가 없습니다. 업소에서 먼저 연락할 수 있도록 등록해보세요.</p>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>내 구인공고</h3>
          <router-link v-if="canPostJob(session.user)" to="/jobs/new">+ 등록</router-link>
        </div>
        <template v-if="canPostJob(session.user)">
          <router-link v-for="job in jobs" :key="job.id" :to="'/jobs/' + job.id" class="row">
            <span class="tag" :class="job.status === 'open' ? 'ok' : 'off'">{{ job.status === 'open' ? '모집중' : '마감' }}</span>
            <span class="row-title">{{ job.title }}</span>
            <span class="muted">조회 {{ job.view_count }}</span>
          </router-link>
          <p class="empty" v-if="!jobs.length">등록한 공고가 없습니다.</p>
        </template>
        <p class="empty" v-else-if="session.user.businessStatus === 'pending'">사업자 서류를 심사 중입니다.</p>
        <p class="empty" v-else>
          구인공고는 사업자등록증·영업허가증을 제출하고 승인받으면 등록할 수 있습니다. (서류 제출 기능 준비 중)
        </p>
      </div>
    </section>`
};
