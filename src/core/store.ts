export type ItemType = 'character' | 'location' | 'art' | 'chat'

export type ContentItem = {
  id: string
  type: ItemType
  title: string
  description: string
  image?: string
}

let items: ContentItem[] = [
  {
    id: '1',
    type: 'location',
    title: 'Черный замок',
    description: 'Старая крепость на севере.'
  }
]

export function getItems(type?: ItemType) {
  if (!type) return items
  return items.filter(item => item.type === type)
}

export function createItem(item: Omit<ContentItem, 'id'>) {
  const newItem = {
    ...item,
    id: Date.now().toString()
  }

  items.push(newItem)
  return newItem
}

export function removeItem(id:string) {
  items = items.filter(item => item.id !== id)
}
