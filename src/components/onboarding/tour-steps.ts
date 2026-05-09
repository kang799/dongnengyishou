export type TourStep = {
  route: string;
  selector: string;
  title: string;
  body: string;
  /** 等待用户点击高亮元素本身才进入下一步；不显示「下一步」按钮 */
  waitForClick?: boolean;
  last?: boolean;
};

export const TOUR_STEPS: TourStep[] = [
  {
    route: "/pet",
    selector: "[data-tour='pet-portrait']",
    title: "结契异兽",
    body: "这是与你结契的山海经异兽，它的成长全凭你的汗水。",
  },
  {
    route: "/pet",
    selector: "[data-tour='pet-stats']",
    title: "三脉真气",
    body: "深蹲炼速、俯卧撑炼力、仰卧起坐炼体。三脉同满即可破壳进化。",
  },
  {
    route: "/pet",
    selector: "[data-tour='nav-train']",
    title: "前往修行",
    body: "点此进入修行殿堂，开启第一次动作识别。",
    waitForClick: true,
  },
  {
    route: "/train",
    selector: "[data-tour='train-squat-card']",
    title: "选择式样",
    body: "三式任选其一，摄像头会自动识别你的动作。",
  },
  {
    route: "/train",
    selector: "[data-tour='train-start-btn']",
    title: "启动修行",
    body: "点此开启摄像头，让异兽与你一同苏醒。",
    waitForClick: true,
    last: true,
  },
];