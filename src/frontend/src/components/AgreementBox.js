/**
 * 파일 역할: 회원가입 약관 동의 박스. 전체동의 + 항목별 동의 + 자세히보기(펼침/접힘).
 *
 * v-model 대신 form 객체를 받아 AGREEMENTS 의 key(agreeTerms 등) 필드를 직접 갱신한다.
 */
import { computed, reactive } from 'vue';
import { AGREEMENTS } from '../content/agreements.js';

export default {
  props: { form: { type: Object, required: true } },
  setup(props) {
    const expanded = reactive({});

    const allAgreed = computed({
      get: () => AGREEMENTS.every((item) => props.form[item.key]),
      set: (value) => AGREEMENTS.forEach((item) => { props.form[item.key] = value; })
    });

    function toggle(key) {
      expanded[key] = !expanded[key];
    }

    return { AGREEMENTS, expanded, allAgreed, toggle };
  },
  template: `
    <div class="agreements">
      <label class="check agree-all">
        <input type="checkbox" v-model="allAgreed" /> 전체동의
        <small class="muted">(선택 항목 포함)</small>
      </label>

      <div class="agree-item" v-for="item in AGREEMENTS" :key="item.key">
        <div class="agree-row">
          <label class="check">
            <input type="checkbox" v-model="form[item.key]" />
            <span><b>({{ item.required ? '필수' : '선택' }})</b> {{ item.title }}</span>
          </label>
          <button type="button" class="link agree-toggle" :aria-expanded="Boolean(expanded[item.key])" @click="toggle(item.key)">
            {{ expanded[item.key] ? '접기' : '자세히보기' }} <i :class="{ open: expanded[item.key] }">›</i>
          </button>
        </div>
        <div class="agree-body" v-if="expanded[item.key]">{{ item.body }}</div>
      </div>
    </div>`
};
