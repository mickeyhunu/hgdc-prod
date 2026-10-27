/**
 * 파일 역할: API 호출 클라이언트, 로그인 상태 스토어, 화면 표기 헬퍼.
 */
import { reactive } from 'vue';

export const session = reactive({ user: null, loaded: false });

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : (method !== 'GET' ? '{}' : undefined)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) session.user = null;
    const error = new Error(data.message || '요청에 실패했습니다.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function loadSession() {
  try {
    const { user } = await api('/auth/me');
    session.user = user;
  } catch (_error) {
    session.user = null;
  }
  session.loaded = true;
}

export const PAY_TYPE_LABEL = { TC: 'TC', DAILY: '일급', WEEKLY: '주급', MONTHLY: '월급', NEGOTIABLE: '협의' };
export const BOARD_LABEL = { free: '자유', anon: '익명', qna: '질문', review: '후기', info: '정보', hot: '🔥 HOT' };

export function formatPay(payType, amount) {
  if (payType === 'NEGOTIABLE' || amount === null || amount === undefined) return '급여 협의';
  return `${PAY_TYPE_LABEL[payType]} ${Number(amount).toLocaleString('ko-KR')}원`;
}

export function formatCareer(months) {
  const value = Number(months) || 0;
  if (!value) return '신입';
  const years = Math.floor(value / 12);
  const rest = value % 12;
  return [years ? `${years}년` : '', rest ? `${rest}개월` : ''].filter(Boolean).join(' ');
}

export function timeAgo(value) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(value).toLocaleDateString('ko-KR');
}

export function splitTags(value) {
  return String(value || '').split(',').filter(Boolean);
}
