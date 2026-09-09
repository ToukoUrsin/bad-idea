type ResetArena={round:number,inventoryReset?:boolean}|null;

type InventoryResetState={
 inventory:unknown[];
 spec:unknown;
 draft:unknown;
 previousForRule:unknown;
 lastInventoryResetRound:number|null;
};

/** Apply a room's reset once, after entering it, never while preparing it. */
export function shouldResetInventory(arena:ResetArena,lastInventoryResetRound:number|null):boolean{
 return !!arena&&arena.round>=6&&arena.inventoryReset===true&&lastInventoryResetRound!==arena.round;
}

/** The persisted marker protects inventions made after this room's reset. */
export function applyInventoryReset<T extends InventoryResetState>(state:T,arena:ResetArena):T{
 if(!shouldResetInventory(arena,state.lastInventoryResetRound))return state;
 return {...state,inventory:[],spec:null,draft:null,previousForRule:null,lastInventoryResetRound:arena!.round};
}
