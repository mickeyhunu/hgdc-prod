/**
 * 파일 역할: Vue 앱/라우터 초기화와 공통 레이아웃(헤더/하단탭/19금 안내).
 *
 * 비회원도 홈과 목록은 볼 수 있다. meta.requiresAuth 가 붙은 화면(상세·작성·마이)은
 * 19세 본인인증 회원 로그인이 필요하며, 비회원이 들어오면 로그인 화면으로 보낸다.
 */
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { session, loadSession } from './api.js';
import HeaderMenu from './components/HeaderMenu.js';
import LoginPage from './pages/LoginPage.js';
import SignupPage from './pages/SignupPage.js';
import HomePage from './pages/HomePage.js';
import { JobListPage, JobDetailPage, JobFormPage } from './pages/JobPages.js';
import { ResumeListPage, ResumeDetailPage, ResumeFormPage } from './pages/ResumePages.js';
import { CommunityListPage, PostDetailPage, PostFormPage } from './pages/CommunityPages.js';
import MyPage from './pages/MyPage.js';

const GUEST_ONLY_ROUTES = ['login', 'signup'];
const auth = { requiresAuth: true };

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/signup', name: 'signup', component: SignupPage },
    { path: '/', name: 'home', component: HomePage },
    { path: '/jobs', name: 'jobs', component: JobListPage },
    { path: '/jobs/new', name: 'job-new', component: JobFormPage, meta: auth },
    { path: '/jobs/:id', name: 'job', component: JobDetailPage, meta: auth },
    { path: '/jobs/:id/edit', name: 'job-edit', component: JobFormPage, meta: auth },
    { path: '/resumes', name: 'resumes', component: ResumeListPage },
    { path: '/resumes/mine/edit', name: 'resume-edit', component: ResumeFormPage, meta: auth },
    { path: '/resumes/:id', name: 'resume', component: ResumeDetailPage, meta: auth },
    { path: '/community', name: 'community', component: CommunityListPage },
    { path: '/community/write', name: 'post-new', component: PostFormPage, meta: auth },
    { path: '/community/:id', name: 'post', component: PostDetailPage, meta: auth },
    { path: '/community/:id/edit', name: 'post-edit', component: PostFormPage, meta: auth },
    { path: '/my', name: 'my', component: MyPage, meta: auth },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});

router.beforeEach(async (to) => {
  if (!session.loaded) await loadSession();
  if (!session.user && to.meta.requiresAuth) return { name: 'login', query: { next: to.fullPath } };
  if (session.user && GUEST_ONLY_ROUTES.includes(to.name)) return { name: 'home' };
  return true;
});

const App = {
  components: { HeaderMenu },
  setup() {
    return { session };
  },
  template: `
    <div class="app">
      <header class="topbar">
        <router-link to="/" class="brand">호구<span>닷컴</span></router-link>
        <nav class="topnav">
          <router-link to="/jobs">구인</router-link>
          <router-link to="/resumes">구직</router-link>
          <router-link to="/community">커뮤니티</router-link>
        </nav>
        <HeaderMenu v-if="session.user" />
        <div class="topbar-user" v-else>
          <router-link :to="['login', 'signup'].includes($route.name) ? '/login' : { path: '/login', query: { next: $route.fullPath } }" class="btn primary sm">로그인</router-link>
        </div>
      </header>

      <main class="container"><router-view :key="$route.fullPath" /></main>

      <nav class="tabbar">
        <router-link to="/jobs" active-class="active"><i>💼</i>구인</router-link>
        <router-link to="/resumes" active-class="active"><i>🙋‍♂️</i>구직</router-link>
        <router-link to="/" exact-active-class="active"><i>🏠</i>홈</router-link>
        <router-link to="/community" active-class="active"><i>💬</i>커뮤니티</router-link>
        <!-- 비회원은 /my 접근 시 라우터 가드가 로그인 화면으로 보낸다 -->
        <router-link to="/my" :class="{ active: ['my', 'login', 'signup'].includes($route.name) }"><i>👤</i>내 정보</router-link>
      </nav>

      <footer class="footer">
        <p><span class="badge-19">19</span> 이 정보내용은 청소년 유해매체물로서 19세 미만의 청소년이 이용할 수 없습니다.</p>
        <p>© 호구닷컴</p>
      </footer>
    </div>`
};

createApp(App).use(router).mount('#app');
