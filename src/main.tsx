import { render } from 'preact';
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/700.css';
import './styles.css';
import { App } from './ui/App';
import { boot } from './ui/store';

render(<App />, document.getElementById('app')!);
boot();
