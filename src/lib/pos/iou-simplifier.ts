export interface MemberBalance {
  id: string
  name: string
  balance: number  // positive = owed money, negative = owes money
}

export interface SimplifiedIOU {
  from_id: string
  from_name: string
  to_id: string
  to_name: string
  amount: number
}

/**
 * Greedy debt simplification (Splitwise-style).
 * Converts N arbitrary debts into the minimum number of transactions.
 *
 * Algorithm:
 *   1. Sort members by net balance
 *   2. Largest creditor receives from largest debtor
 *   3. Repeat until all settled
 */
export function simplifyDebts(members: MemberBalance[]): SimplifiedIOU[] {
  const result: SimplifiedIOU[] = []

  // Clone to avoid mutation
  const balances = members.map(m => ({ ...m, balance: Math.round(m.balance * 100) })) // work in cents

  while (true) {
    balances.sort((a, b) => a.balance - b.balance) // ascending: biggest debtor first, biggest creditor last

    const debtor = balances[0]
    const creditor = balances[balances.length - 1]

    if (Math.abs(debtor.balance) < 1 && Math.abs(creditor.balance) < 1) break

    const amount = Math.min(-debtor.balance, creditor.balance)
    if (amount <= 0) break

    result.push({
      from_id: debtor.id,
      from_name: debtor.name,
      to_id: creditor.id,
      to_name: creditor.name,
      amount: Math.round(amount) / 100,
    })

    debtor.balance += amount
    creditor.balance -= amount
  }

  return result
}