import { Link } from 'react-router-dom';
import type { Project } from '../domain/models';
import { useFilters } from '../app/context';
import { StatusStamp } from './ui';
import type { ReactNode } from 'react';
export function ObjectHeader({
  project,
  title,
  children,
}: {
  project: Project;
  title?: string;
  children?: ReactNode;
}) {
  const { params } = useFilters();
  return (
    <header className="pagehead">
      <Link className="crumb no-print" to={'/objects' + (params.size ? '?' + params.toString() : '')}>
        ← Ведомость объектов
      </Link>
      <div className="pagehead-row">
        <div>
          <p className="eyebrow">
            {title ? project.name : 'Объект ' + project.number.toString().padStart(2, '0')}
          </p>
          <h1 className="h-page">{title ?? project.name}</h1>
        </div>
        <div className="head-side no-print">
          {children}
          <StatusStamp status={project.status} />
        </div>
      </div>
      <dl className="factline">
        <div>
          <dt>Округ</dt>
          <dd>{project.district}</dd>
        </div>
        <div>
          <dt>Текущий этап</dt>
          <dd>{project.stage}</dd>
        </div>
        <div>
          <dt>Программа</dt>
          <dd>{project.programme}</dd>
        </div>
        <div>
          <dt>Разрешение</dt>
          <dd className="reg">{project.permit}</dd>
        </div>
      </dl>
    </header>
  );
}
