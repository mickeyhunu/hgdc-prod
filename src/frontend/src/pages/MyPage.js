/**
 * 파일 역할: 마이페이지. 회원 유형별로 내 공고 / 내 이력서 바로가기를 보여준다.
 */
import { onMounted, ref } from 'vue';
import { api, session, timeAgo } from '../api.js';

const MEMBER_TYPE_LABEL = { player: '선수 회원', business: '업소 회원', admin: '관리자' };

export default {
  setup() {
    const jobs = ref([]);
    const resume = ref(null);
    onMounted(async () => {
      if (session.user.memberType === 'business') jobs.value = (await api('/jobs/mine')).items;
      if (session.user.memberType === 'player') resume.value = (await api('/resumes/mine')).resume;
    });
    return { session, jobs, resume, timeAgo, MEMBER_TYPE_LABEL };
  },
  template: `
    <section>
      <div class="panel">
        <h2>{{ session.user.nickname }}</h2>
        <p class="muted">{{ session.user.loginId }} · {{ MEMBER_TYPE_LABEL[session.user.memberType] }} · <span class="ok-text">19세 본인인증 완료</span></p>
      </div>

      <div class="panel" v-if="session.user.memberType === 'business'">
        <div class="panel-head"><h3>내 구인공고</h3><router-link to="/jobs/new">+ 등록</router-link></div>
        <router-link v-for="job in jobs" :key="job.id" :to="'/jobs/' + job.id" class="row">
          <span class="tag" :class="job.status === 'open' ? 'ok' : 'off'">{{ job.status === 'open' ? '모집중' : '마감' }}</span>
          <span class="row-title">{{ job.title }}</span>
          <span class="muted">조회 {{ job.view_count }}</span>
        </router-link>
        <p class="empty" v-if="!jobs.length">등록한 공고가 없습니다.</p>
      </div>

      <div class="panel" v-if="session.user.memberType === 'player'">
        <div class="panel-head"><h3>내 이력서</h3><router-link to="/resumes/mine/edit">{{ resume ? '수정' : '작성' }}</router-link></div>
        <router-link v-if="resume" :to="'/resumes/' + resume.id" class="row">
          <span class="tag" :class="resume.is_public ? 'ok' : 'off'">{{ resume.is_public ? '공개' : '비공개' }}</span>
          <span class="row-title">{{ resume.title }}</span>
          <span class="muted">조회 {{ resume.view_count }}</span>
        </router-link>
        <p class="empty" v-else>아직 이력서가 없습니다. 업소에서 먼저 연락할 수 있도록 등록해보세요.</p>
      </div>
    </section>`
};
