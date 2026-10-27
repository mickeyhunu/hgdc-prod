/**
 * 파일 역할: 목록 하단 페이지네이션.
 */
import { computed } from 'vue';

export default {
  props: { page: Number, size: Number, total: Number },
  emits: ['go'],
  setup(props) {
    const lastPage = computed(() => Math.max(1, Math.ceil((props.total || 0) / (props.size || 20))));
    const pages = computed(() => {
      const start = Math.max(1, props.page - 2);
      const end = Math.min(lastPage.value, start + 4);
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });
    return { lastPage, pages };
  },
  template: `
    <nav class="pager" v-if="lastPage > 1">
      <button :disabled="page <= 1" @click="$emit('go', page - 1)">‹</button>
      <button v-for="p in pages" :key="p" :class="{ on: p === page }" @click="$emit('go', p)">{{ p }}</button>
      <button :disabled="page >= lastPage" @click="$emit('go', page + 1)">›</button>
    </nav>`
};
