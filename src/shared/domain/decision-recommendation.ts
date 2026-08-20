import type { Decision } from "./model";

export interface DecisionRecommendationInput {
  text: string;
  hasConfirmedProgress: boolean;
  hasConcreteBlocker: boolean;
}

export function recommendProjectDecision(input: DecisionRecommendationInput): Decision {
  const text = input.text.replace(/[\t\r\n ]+/gu, " ").slice(0, 12_000);
  const explicitlyKeepsProject =
    /(?:不想|不要|不愿意|不能|不应该|不打算|并不想|没有想)\s*放弃|(?:do not|don't|dont|should not|shouldn't)\s+(?:want to\s+)?(?:give up|abandon)/iu.test(
      text
    );
  if (
    !explicitlyKeepsProject &&
    /(?:决定|准备|想要|打算)\s*(?:彻底)?(?:放弃|不再做|结束这个项目)|(?:项目|报名).{0,16}(?:已经取消|已经过期|截止已过)|错过(?:了)?(?:截止|报名)|(?:不再|已经不)值得继续|(?:decided|plan|want)\s+to\s+(?:abandon|give up|stop)|(?:missed|past)\s+(?:the\s+)?deadline|no longer worth continuing/iu.test(
      text
    )
  ) {
    return "abandon";
  }
  if (
    /(?:先暂停|暂缓|暂时不做|以后再做|目前没时间|等.{0,24}(?:开放|通知|条件具备|有时间))|(?:pause|not now|wait until|come back later)/iu.test(
      text
    )
  ) {
    return "pause";
  }
  if (
    /(?:没有权限|需要.{0,24}(?:老师|同学|队友|导师|客服|主办方|管理员).{0,24}(?:帮助|确认|反馈|回复)|等待.{0,24}(?:确认|反馈|回复|审批))|(?:need|waiting for).{0,32}(?:help|permission|approval|feedback|reply|confirmation)/iu.test(
      text
    )
  ) {
    return "help";
  }
  if (
    /(?:范围太大|目标太大|任务太多|太复杂|时间不够|来不及|不知道从哪|无从下手|事情太多|说不清|不清楚|无法确定)|(?:too big|too broad|too complex|not enough time|don't know where to start|unclear)/iu.test(
      text
    )
  ) {
    return "shrink";
  }
  if (!input.hasConfirmedProgress || !input.hasConcreteBlocker) return "shrink";
  return "continue";
}

export function isConfirmedInferenceField(value: string): boolean {
  return !/(?:需要你确认|还不能确定|没有明确|说不清|不清楚|cannot determine|not clear|unclear)/iu.test(
    value
  );
}
