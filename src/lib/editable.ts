// Used on both the server and client
//
// Sent with post when created to mark the creator as able to edit (edit-able)
// that post.
//
// TODO: add expiry date (too lazy rn)
export let editables: { 
    editId: string;
    postId: number;
}[] = [];

export function editable(postId: number): boolean {
    return editables.find((el) => el.postId == postId) !== undefined;
}

const idLength = 32; // good luck brute forcing this haha :>
export function makeEditId(): string {
    let newId = "";
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+{}|:<>?-=[];',./`~";
    for (let i = 0; i < idLength; i++) {
        newId += characters.charAt(
            Math.floor(Math.random() * characters.length),
        );
    }
    return editables.find((el) => el.editId == newId) ? makeEditId() : newId;
}
