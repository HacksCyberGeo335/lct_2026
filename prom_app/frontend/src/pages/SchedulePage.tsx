import { ObjectWorkspace } from '../features/projects/ObjectWorkspace';
export function SchedulePage() {
  return (
    <>
      <header className="pagehead">
        <p className="eyebrow">Планирование строительства</p>
        <h1 className="h-page">График работ</h1>
        <p className="meta">Создайте график вручную или импортируйте CSV и выберите объект.</p>
      </header>
      <ObjectWorkspace view="schedule" />
    </>
  );
}
