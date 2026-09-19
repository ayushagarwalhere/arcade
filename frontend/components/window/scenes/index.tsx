import type { Scene } from "../AppWindow";
import { mapScene } from "./map";
import { attackScene } from "./attack";
import { defendScene } from "./defend";
import { remediateScene } from "./remediate";
import { verifyScene } from "./verify";

export const SCENES: Scene[] = [mapScene, attackScene, defendScene, remediateScene, verifyScene];