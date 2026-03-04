<div class="error-page">
	<img src="/404.png" alt="404" />
	<p>404</p>
</div>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		width: 100vw;
		position: fixed;
		top: 0;
		left: 0;
	}

	img {
		max-width: 40vw;
		max-height: 30vh;
		object-fit: contain;
		mix-blend-mode: multiply;
	}

	p {
		margin-top: 1rem;
		font-size: 2rem;
		color: white;
		font-family: monospace;
	}
</style>
