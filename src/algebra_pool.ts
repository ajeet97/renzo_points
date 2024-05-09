import { EthChainId, RichBlock } from "@sentio/sdk/eth";
import { BOOST, CAMELOT_ALGEBRA_POOL, START_BLOCK } from "./constants.js";
import { AlgebraPoolContext, AlgebraPoolProcessor, SwapEvent } from "./types/eth/algebrapool.js";
import { db } from "./db.js";
import { calcElPoints, updateAccountPoints, updateAllPositions } from "./utils.js";

async function swapHandler(_event: SwapEvent, ctx: AlgebraPoolContext) {
    if (ctx.blockNumber < START_BLOCK.CamelotPool) return

    await updateAllPositions(ctx)
}

async function timeIntervalHandler(_block: RichBlock, ctx: AlgebraPoolContext) {
    if (ctx.blockNumber < START_BLOCK.CamelotPool) return

    const positions = await db.camelotPositions.asyncFind({}) // should paginate?

    await Promise.all(positions.map(async (position) => {
        const deltaElPoints = calcElPoints(ctx, position)
        await updateAccountPoints(ctx, position.owner, deltaElPoints, BOOST.CAMELOT_POOL)
    }))
}

AlgebraPoolProcessor
    .bind({
        address: CAMELOT_ALGEBRA_POOL,
        network: EthChainId.ARBITRUM,
        startBlock: START_BLOCK.CamelotPool,
    })
    .onEventSwap(swapHandler)
    .onTimeInterval(timeIntervalHandler, 60, 0)
