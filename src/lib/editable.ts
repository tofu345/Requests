export let editables: { editId: string; postId: number }[] = [];

export function newEditable(postId: number): string {
    let editId = makeEditId();
    editables.push({ editId, postId });
    return editId;
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
