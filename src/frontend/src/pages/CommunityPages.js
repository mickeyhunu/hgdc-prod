/**
 * 파일 역할: 커뮤니티 목록 / 게시글 상세(댓글·추천) / 글쓰기·수정 페이지.
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, session, timeAgo, BOARD_LABEL } from '../api.js';
import ReportButton from '../components/ReportButton.js';
import Pager from '../components/Pager.js';

const TABS = ['', 'hot', 'free', 'anon', 'qna', 'review', 'info'];

export const CommunityListPage = {
  components: { Pager },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const board = computed(() => String(route.query.board || ''));
    const keyword = ref(route.query.q || '');
    const result = ref({ items: [], total: 0, page: 1, size: 20 });
    const error = ref('');

    function go(nextBoard, page = 1) {
      const query = {};
      if (nextBoard) query.board = nextBoard;
      if (keyword.value) query.q = keyword.value;
      if (page > 1) query.page = page;
      router.push({ path: '/community', query });
    }

    onMounted(async () => {
      try {
        result.value = await api(`/community/posts?${new URLSearchParams({ ...route.query })}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    });

    const writeLink = computed(() => ({
      path: '/community/write',
      query: board.value && board.value !== 'hot' ? { board: board.value } : {}
    }));

    return { session, TABS, BOARD_LABEL, board, keyword, result, error, go, writeLink, timeAgo };
  },
  template: `
    <section>
      <div class="page-head">
        <h2>커뮤니티</h2>
        <router-link :to="writeLink" class="btn primary sm">글쓰기</router-link>
      </div>
      <div class="tabs">
        <button v-for="tab in TABS" :key="tab" :class="{ on: board === tab }" @click="go(tab)">{{ tab ? BOARD_LABEL[tab] : '전체' }}</button>
      </div>
      <p class="error" v-if="error">{{ error }}</p>
      <ul class="post-list">
        <li v-for="post in result.items" :key="post.id">
          <router-link :to="'/community/' + post.id">
            <span class="tag">{{ BOARD_LABEL[post.board] }}</span>
            <span v-if="!session.user" class="lock">🔒</span>
            <span class="row-title">{{ post.title }} <em v-if="post.comment_count">[{{ post.comment_count }}]</em></span>
            <span class="meta">{{ post.author }} · {{ timeAgo(post.created_at) }} · 조회 {{ post.view_count }} · ♥ {{ post.like_count }}</span>
          </router-link>
        </li>
      </ul>
      <p class="empty" v-if="!result.items.length">게시글이 없습니다.</p>
      <Pager :page="result.page" :size="result.size" :total="result.total" @go="(p) => go(board, p)" />
      <form class="filters" @submit.prevent="go(board)">
        <input v-model.trim="keyword" placeholder="제목·내용 검색" />
        <button class="btn sm">검색</button>
      </form>
    </section>`
};

export const PostDetailPage = {
  components: { ReportButton },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const post = ref(null);
    const error = ref('');
    const comment = reactive({ content: '', parentId: null, isAnonymous: false });

    async function load() {
      try {
        post.value = await api(`/community/posts/${route.params.id}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    }

    async function like() {
      const result = await api(`/community/posts/${post.value.id}/like`, { method: 'POST' });
      post.value.liked = result.liked;
      post.value.like_count = result.likeCount;
    }

    async function addComment() {
      if (!comment.content.trim()) return;
      try {
        await api(`/community/posts/${post.value.id}/comments`, { method: 'POST', body: { ...comment } });
        Object.assign(comment, { content: '', parentId: null });
        await load();
      } catch (requestError) {
        alert(requestError.message);
      }
    }

    async function removeComment(id) {
      if (!confirm('댓글을 삭제할까요?')) return;
      await api(`/community/comments/${id}`, { method: 'DELETE' });
      await load();
    }

    async function removePost() {
      if (!confirm('게시글을 삭제할까요?')) return;
      await api(`/community/posts/${post.value.id}`, { method: 'DELETE' });
      router.replace('/community');
    }

    onMounted(load);
    return { post, error, comment, like, addComment, removeComment, removePost, timeAgo, BOARD_LABEL };
  },
  template: `
    <section v-if="post" class="detail">
      <router-link :to="{ path: '/community', query: { board: post.board } }" class="back">← {{ BOARD_LABEL[post.board] }} 게시판</router-link>
      <div class="detail-head">
        <h2>{{ post.title }}</h2>
        <p class="muted">{{ post.author }} · {{ timeAgo(post.created_at) }} · 조회 {{ post.view_count }}</p>
      </div>
      <div class="content">{{ post.content }}</div>

      <div class="actions center">
        <button class="btn like" :class="{ on: post.liked }" @click="like">♥ {{ post.like_count }}</button>
      </div>
      <div class="actions">
        <template v-if="post.canManage">
          <router-link class="btn sm" :to="'/community/' + post.id + '/edit'">수정</router-link>
          <button class="btn sm danger" @click="removePost">삭제</button>
        </template>
        <ReportButton v-if="!post.isMine" target-type="post" :target-id="post.id" />
      </div>

      <h4>댓글 {{ post.comments.filter(c => !c.deleted).length }}</h4>
      <ul class="comments">
        <li v-for="c in post.comments" :key="c.id" :class="{ reply: c.parent_id, deleted: c.deleted }">
          <div class="comment-meta">
            <b>{{ c.author }}</b> <span class="muted">{{ timeAgo(c.created_at) }}</span>
            <template v-if="!c.deleted">
              <button v-if="!c.parent_id" class="link" @click="comment.parentId = c.id">답글</button>
              <button v-if="c.canManage" class="link" @click="removeComment(c.id)">삭제</button>
              <ReportButton v-if="!c.isMine" target-type="comment" :target-id="c.id" />
            </template>
          </div>
          <p>{{ c.content }}</p>
        </li>
      </ul>

      <form class="comment-form" @submit.prevent="addComment">
        <p class="muted" v-if="comment.parentId">↳ 답글 작성 중 <button type="button" class="link" @click="comment.parentId = null">취소</button></p>
        <textarea v-model="comment.content" rows="3" maxlength="1000" placeholder="댓글을 입력하세요"></textarea>
        <div class="comment-form-foot">
          <label class="check" v-if="post.board !== 'anon'"><input type="checkbox" v-model="comment.isAnonymous" /> 익명</label>
          <button class="btn primary sm">등록</button>
        </div>
      </form>
    </section>
    <p class="error" v-else-if="error">{{ error }}</p>`
};

export const PostFormPage = {
  setup() {
    const route = useRoute();
    const router = useRouter();
    const boards = ref([]);
    const isEdit = Boolean(route.params.id);
    const form = reactive({ board: String(route.query.board || 'free'), title: '', content: '', isAnonymous: false });
    const error = ref('');

    onMounted(async () => {
      boards.value = (await api('/community/boards')).boards;
      if (isEdit) {
        const post = await api(`/community/posts/${route.params.id}`);
        Object.assign(form, { board: post.board, title: post.title, content: post.content, isAnonymous: post.author === '익명' });
      }
    });

    async function submit() {
      error.value = '';
      try {
        const { id } = isEdit
          ? await api(`/community/posts/${route.params.id}`, { method: 'PUT', body: form })
          : await api('/community/posts', { method: 'POST', body: form });
        router.replace(`/community/${id}`);
      } catch (requestError) {
        error.value = requestError.message;
      }
    }

    return { boards, isEdit, form, error, submit };
  },
  template: `
    <section class="form-page">
      <h2>{{ isEdit ? '글 수정' : '글쓰기' }}</h2>
      <form class="stack" @submit.prevent="submit">
        <select v-model="form.board"><option v-for="b in boards" :key="b.key" :value="b.key">{{ b.name }}</option></select>
        <input v-model.trim="form.title" maxlength="100" placeholder="제목" required />
        <textarea v-model="form.content" rows="14" maxlength="10000" placeholder="내용 (업소 실명 비방, 개인정보 노출 글은 삭제될 수 있습니다)" required></textarea>
        <label class="check" v-if="form.board !== 'anon'"><input type="checkbox" v-model="form.isAnonymous" /> 익명으로 작성</label>
        <p class="error" v-if="error">{{ error }}</p>
        <button class="btn primary">{{ isEdit ? '수정 완료' : '등록' }}</button>
      </form>
    </section>`
};
