"use client";
import { useState } from "react";
import Link from "next/link";
import { COPY } from "./copy";

/** サイドクエスト（仕様 §2）：目標設定に迷う人向けの整理。任意・スキップ可 */
export function SideQuest() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="card side-quest">
      <b>SIDE QUEST｜{COPY.sideQuest}</b>
      <ul className="small">
        <li>LEVEL01 で選んだ「最も優先したい願望」から、1つだけ選んでみる</li>
        <li>LEVEL04 の「人生の目的」を読み返し、その目的に近づく出来事を考える</li>
        <li>長期は「いつか実現したい姿」、短期は「3か月以内にできる一歩」で十分</li>
      </ul>
      <div className="row">
        <Link className="btn small ghost" href="/apps/APP01/level/1">LEVEL01 を見返す</Link>
        <Link className="btn small ghost" href="/apps/APP01/level/4">LEVEL04 を見返す</Link>
        <button type="button" className="btn small ghost" onClick={() => setHidden(true)}>{COPY.sideQuestSkip}</button>
      </div>
    </div>
  );
}
