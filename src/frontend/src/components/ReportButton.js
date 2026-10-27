/**
 * 파일 역할: 공고/이력서/게시글/댓글 공통 신고 버튼.
 */
import { api } from '../api.js';

export default {
  props: { targetType: { type: String, required: true }, targetId: { type: Number, required: true } },
  setup(props) {
    async function report() {
      const reason = prompt('신고 사유를 입력해주세요. (예: 사기 의심, 허위 공고, 욕설)');
      if (!reason || !reason.trim()) return;
      try {
        await api('/reports', { method: 'POST', body: { targetType: props.targetType, targetId: props.targetId, reason } });
        alert('신고가 접수되었습니다.');
      } catch (error) {
        alert(error.message);
      }
    }
    return { report };
  },
  template: `<button type="button" class="btn sm ghost" @click="report">신고</button>`
};
