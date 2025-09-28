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

const imageWidth = 12.25;
const imageClass = "w-fit p-[2px] rounded-border-transp";
</script>

<div class="h-5">
    <!-- There is a reason for these 2 divs, future me -->
    <div class="flex flex-wrap gap-2">
        {#if admin}
            <button
                onclick={() => deletePost(postID)}
                class="{imageClass} bg-red-400">
                <img width="{imageWidth}" src="/trash.svg" alt="delete" />
            </button>
        {/if}
        {#if currentEditId && postID == currentEditId}
            <button
                onclick={() => abortEdit(postID)}
                class="{imageClass} bg-red-400">
                <img width="{imageWidth}" src="/close.svg" alt="close" />
            </button>
        {:else if admin || editable(postID)}
            <button
                onclick={() => startEdit(postID)}
                class="{imageClass} bg-blue-400">
                <img width="{imageWidth}" src="/edit.svg" alt="edit" />
            </button>
        {/if}
    </div>
</div>
