export type Taxonomy = { id: string; name: string; description?: string };
export type Eyecatch = { url: string; width: number; height: number; alt?: string | null };
export type BlogPost = { id: string; title: string; excerpt?: string; content: string; publishedAt: string; updatedAt: string; category?: Taxonomy | null; tags: Taxonomy[]; eyecatch?: Eyecatch | null };
type ListResponse<T> = { contents: T[]; totalCount: number };
type GetPostsOptions = { limit?: number; categoryId?: string; tagId?: string };
const serviceDomain = import.meta.env.MICROCMS_SERVICE_DOMAIN;
const apiKey = import.meta.env.MICROCMS_API_KEY;
function getMicrocmsConfig() { if (!serviceDomain || !apiKey) throw new Error('MICROCMS_SERVICE_DOMAIN と MICROCMS_API_KEY を設定してください。'); return { serviceDomain, apiKey }; }
async function request<T>(endpoint: string, path = '', query = ''): Promise<T> { const config = getMicrocmsConfig(); const response = await fetch(`https://${config.serviceDomain}.microcms.io/api/v1/${endpoint}${path}${query}`, { headers: { 'X-MICROCMS-API-KEY': config.apiKey } }); if (!response.ok) throw new Error(`microCMS の取得に失敗しました (${response.status})`); return response.json() as Promise<T>; }
export async function getPosts({ limit, categoryId, tagId }: GetPostsOptions = {}): Promise<BlogPost[]> {
	const params = new URLSearchParams({ orders: '-publishedAt', depth: '1' });
	if (limit) params.set('limit', String(limit));
	if (categoryId) params.set('filters', `category[equals]${categoryId}`);
	if (tagId) params.set('filters', `tags[contains]${tagId}`);
	return (await request<ListResponse<BlogPost>>('blogs', '', `?${params}`)).contents;
}
export async function getCategories(): Promise<Taxonomy[]> { return (await request<ListResponse<Taxonomy>>('categories', '', '?orders=name')).contents; }
export async function getTags(): Promise<Taxonomy[]> { return (await request<ListResponse<Taxonomy>>('tags', '', '?orders=name')).contents; }
