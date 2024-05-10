# Renzo Points

This repo creates a sentio processor to keep track of renzo points.

The token `ezETH` is being tracked on Arbitrum for

- wallet balance
- Camelot's [ezETH/ETH](https://info.camelot.exchange/pair/v3/0xaa45265a94c93802be9511e426933239117e658f) pool

## Points calculation

Every state in db extends a `IPointState`.

```ts
interface IPointState {
    ezEthBalance: string
    lastUpdatedMillis: number
}
```

On every event, corresponding state is loaded and the points are updated based on the time passed since last updated.

And then the points get boosted accordingly & added to `IAccount` state.

```ts
interface IAccount {
    _id: string // address
    elPoints: string // eigen layer points
    ezPoints: string // renzo points
}
```

And whenever the points are updated in db, an event `point_updated` is emitted and `Counter` is updated to track total eigen layer points & renzo points.

## Processors

### EzEth Processor

Contract - ezETH ERC20: [0x2416092f143378750bb29b79ed961ab195cceea5](https://arbiscan.io/token/0x2416092f143378750bb29b79ed961ab195cceea5)

Events -

- `Transfer(from, to, value)`  
    Zero address is excluded from point accounting.

    And camelot's algebra pool address is also being excluded.  
    Because it holds ezETH to provide liquidity of the pool.  
    So to avoid double point counting, this needs to be excluded.

### NFPManager Processor

Contract - Camelot NFT Position Manager: [0x00c7f3082833e796A5b3e4Bd59f6642FF44DCD15](https://arbiscan.io/address/0x00c7f3082833e796a5b3e4bd59f6642ff44dcd15)

Events -

- `Transfer(from, to, tokenId)`  
    Filters token by Camelot pool.  
    Position is tracked in local db.

- `IncreaseLiquidity(tokenId, liquidity, actualLiquidity, amount0, amount1, pool)`  
    Filters by Camelot pool.  
    Position is updated with latest liquidity.  
    All users' liquidity gets recalculated.

- `DecreaseLiquidity(tokenId, liquidity, amount0, amount1)`  
    Position is updated with latest liquidity.  
    All users' liquidity gets recalculated.

### Camelot AlgebraPool Processor

Contract - Camelot AlgebraPool: [0xaA45265A94C93802BE9511E426933239117E658f](https://arbiscan.io/address/0xaa45265a94c93802be9511e426933239117e658f)

Events -

- `Swap(sender, recipient, amount0, amount1, price, liquidity, tick)`  
    All users' liquidity gets recalculated.

> **Note**
> The pool contract has `mint` & `burn` event, but there is no owner info which can be used to keep track, hence monitoring `NFPManager`'s events

### Hourly Processor

Every hour, all users' points get updated.

## Pending Work

- Liquidity is also minted form `spNFT` (auto mode) contract. Events from this contract needs to be monitored as well.
- For lazy update user's position, keep track of timestamps where liquidity of the pool gets updated and for each user track till which checkpoint points has been calculated. And update points with latest checkpoint.
- Figure out other events on AlgebraPool that needs to be watched
- Fetch `tickSpacing` from AlgebraPool contract and use that to construct `Pool` instance.

### Check if possible

- Time interval processor can be removed by adding info for each state & corresponding boost in logs.
- Just watch for swap, mint & burn on AlgebraPool and somehow figure out who the owner was.
