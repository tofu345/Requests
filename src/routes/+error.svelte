<script>
import { page } from '$app/state';
</script>

<div class="stati">
<a href="/" class="absolute top-0 left-0 text-gray-300 w-fit flex items-center gap-2 m-3 p-2">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-return-left" viewBox="0 0 16 16">
        <path fill-rule="evenodd" d="M14.5 1.5a.5.5 0 0 1 .5.5v4.8a2.5 2.5 0 0 1-2.5 2.5H2.707l3.347 3.346a.5.5 0 0 1-.708.708l-4.2-4.2a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 8.3H12.5A1.5 1.5 0 0 0 14 6.8V2a.5.5 0 0 1 .5-.5"/>
    </svg>
    <p> Back </p>
</a>
</div>

<div class="w-full h-[100svh] flex-center flex-col">
    <div class="h-40 max-w-[80%] centered container-bg flex-center gap-2">
        <h1 class="text-2xl text-red-400"> {page.status} </h1>
        <p> {page.error?.message || 'No Message'} </p>
    </div>
</div>
