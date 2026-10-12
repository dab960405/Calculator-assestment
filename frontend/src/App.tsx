import { CalculatorForm } from './components/CalculatorForm';

export default function App() {
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Calculator</h1>
        <p className="app__description">
          Choose an operation and enter your numbers. The result is calculated on the server.
        </p>
      </header>
      <CalculatorForm />
    </main>
  );
}
