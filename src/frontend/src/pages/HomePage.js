/**
 * 파일 역할: 메인 홈. 최신 구인공고 / 구직 이력서 / 커뮤니티 최신글·HOT 글 요약.
 */
import { onMounted, ref } from 'vue';
import { api, session, canPostJob, formatPay, formatCareer, timeAgo, splitTags, BOARD_LABEL } from '../api.js';

export default {
  setup() {
    const data = ref({ jobs: [], resumes: [], posts: [], hot: [] });
    const error = ref('');
    onMounted(async () => {
      try {
        data.value = await api('/home');
      } catch (requestError) {
        error.value = requestError.message;
      }
    });
    return { data, error, session, canPostJob, formatPay, formatCareer, timeAgo, splitTags, BOARD_LABEL };
  },
  template: `
    <section>
      <div class="hero">
        <div>
          <h1>오늘 밤, 일할 곳 <span>찾았다.</span></h1>
          <p>전국 업소 선수 모집 공고와 선수 프로필을 한 곳에서.</p>
        </div>
        <router-link v-if="canPostJob(session.user)" to="/jobs/new" class="btn primary">+ 구인공고 등록</router-link>
        <router-link v-else-if="session.user" to="/resumes/mine/edit" class="btn primary">+ 내 이력서 등록</router-link>
        <router-link v-else to="/signup" class="btn primary">19세 본인인증 가입</router-link>
      </div>
      <p class="error" v-if="error">{{ error }}</p>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-head"><h3>최신 구인</h3><router-link to="/jobs">더보기 ›</router-link></div>
          <router-link v-for="job in data.jobs" :key="job.id" :to="'/jobs/' + job.id" class="row">
            <span class="tag">{{ job.region }}</span>
            <span class="row-title">{{ job.title }}</span>
            <span class="pay">{{ formatPay(job.pay_type, job.pay_amount) }}</span>
          </router-link>
          <p class="empty" v-if="!data.jobs.length">등록된 공고가 없습니다.</p>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>최신 구직</h3><router-link to="/resumes">더보기 ›</router-link></div>
          <router-link v-for="resume in data.resumes" :key="resume.id" :to="'/resumes/' + resume.id" class="row">
            <span class="tag">{{ splitTags(resume.regions)[0] }}</span>
            <span class="row-title">{{ resume.title }}</span>
            <span class="muted">{{ formatCareer(resume.career_months) }}</span>
          </router-link>
          <p class="empty" v-if="!data.resumes.length">등록된 이력서가 없습니다.</p>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>🔥 주간 HOT</h3><router-link to="/community?board=hot">더보기 ›</router-link></div>
          <router-link v-for="post in data.hot" :key="post.id" :to="'/community/' + post.id" class="row">
            <span class="tag">{{ BOARD_LABEL[post.board] }}</span>
            <span class="row-title">{{ post.title }}</span>
            <span class="muted">♥ {{ post.like_count }}</span>
          </router-link>
          <p class="empty" v-if="!data.hot.length">아직 HOT 글이 없습니다.</p>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>커뮤니티 최신글</h3><router-link to="/community">더보기 ›</router-link></div>
          <router-link v-for="post in data.posts" :key="post.id" :to="'/community/' + post.id" class="row">
            <span class="tag">{{ BOARD_LABEL[post.board] }}</span>
            <span class="row-title">{{ post.title }} <em v-if="post.comment_count">[{{ post.comment_count }}]</em></span>
            <span class="muted">{{ timeAgo(post.created_at) }}</span>
          </router-link>
          <p class="empty" v-if="!data.posts.length">첫 글을 남겨보세요.</p>
        </div>
      </div>
    </section>`
};
