<script lang="ts">
import { editable } from "$lib/editable";

type PostAction = (id: number) => void;
type Props = {
    admin: boolean,
    postID: number,
    currentEditId: number | undefined,
    startEdit: PostAction,
    deletePost: PostAction,
    abortEdit: PostAction,
};

let {
    admin, postID, currentEditId,
    startEdit, deletePost, abortEdit
}: Props = $props();
</script>

<div class="h-full w-12 flex gap-2">
    {#if admin}
        <button
            onclick={() => deletePost(postID)}
            class="w-fit bg-red-400 p-[3px] rounded-border-transp">
            <img width="13" src="/trash.svg" alt="delete" />
        </button>
    {/if}
    {#if currentEditId && postID == currentEditId}
        <button
            onclick={() => abortEdit(postID)}
            class="w-fit bg-red-400 p-1 rounded-border-transp">
            <img width="10" src="/close.svg" alt="close" />
        </button>
    {:else if admin || editable(postID)}
        <button
            onclick={() => startEdit(postID)}
            class="w-fit bg-blue-400 p-1 rounded-border-transp">
            <img width="10" src="/edit.svg" alt="edit" />
        </button>
    {/if}
</div>
